import { IExecuteFunctions, IHttpRequestOptions, IHttpRequestMethods, IBinaryData } from 'n8n-workflow';
import { OCREngineCredentials, ProcessingOptions, SessionStatus, OCRResult } from './types';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export class OCREngineApiClient {
	private baseUrl: string;
	private executeFunctions: IExecuteFunctions;

	constructor(baseUrl: string, executeFunctions: IExecuteFunctions) {
		this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
		this.executeFunctions = executeFunctions;
	}

	async processFile(
		buffer: Buffer,
		fileName: string,
		mimeType: string,
		options: ProcessingOptions,
		credentials: OCREngineCredentials
	): Promise<{ sessionId: string; status: SessionStatus }> {
		// Validate input parameters
		if (!buffer || buffer.length === 0) {
			throw new Error('Invalid or empty file buffer provided');
		}

		// Ensure buffer is a proper Buffer instance
		const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
		
		// Ensure we have valid filename and content type
		const safeFileName = fileName || 'document.pdf';
		const safeContentType = mimeType || 'application/octet-stream';

		// Choose the correct endpoint based on OCR engine
		let endpoint = '/api/upload';
		if (options.ocrEngine === 'gemini-direct') {
			endpoint = '/api/gemini-direct';
		}

		// Create multipart/form-data manually
		const boundary = `----FormBoundary${Date.now()}`;
		const parts: Buffer[] = [];
		
		// Helper function to add a field
		const addField = (name: string, value: string) => {
			parts.push(Buffer.from(`--${boundary}\r\n`));
			parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
			parts.push(Buffer.from(`${value}\r\n`));
		};

		// Add all fields
		addField('output_format', options.outputFormat);
		addField('language', options.languages.join(','));
		
		// Add OCR engine for upload endpoint
		if (endpoint === '/api/upload') {
			addField('ocr_engine', options.ocrEngine);
		}

		if (options.enhanceLlm) {
			addField('enhance_llm', 'true');
			if (options.llmProvider) {
				addField('llm_provider', options.llmProvider);
			}
			if (options.geminiModel) {
				addField('gemini_model', options.geminiModel);
			}
		}

		if (options.extractImages !== undefined) {
			addField('extract_images', options.extractImages.toString());
		}

		// Add API keys if provided
		if (credentials.geminiApiKey) {
			addField('gemini_api_key', credentials.geminiApiKey);
		}

		if (options.llmProvider === 'ollama') {
			// TODO: Get Ollama URL from connected model node
			// For now, use a default URL
			addField('ollama_base_url', 'http://localhost:11434');
			if (options.ollamaModel) {
				addField('ollama_model', options.ollamaModel);
			}
		}

		// Add file
		parts.push(Buffer.from(`--${boundary}\r\n`));
		parts.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="${safeFileName}"\r\n`));
		parts.push(Buffer.from(`Content-Type: ${safeContentType}\r\n\r\n`));
		parts.push(fileBuffer);
		parts.push(Buffer.from('\r\n'));
		
		// Add closing boundary
		parts.push(Buffer.from(`--${boundary}--\r\n`));
		
		// Combine all parts
		const bodyBuffer = Buffer.concat(parts);

		const requestOptions: IHttpRequestOptions = {
			method: 'POST' as IHttpRequestMethods,
			url: `${this.baseUrl}${endpoint}`,
			body: bodyBuffer,
			headers: {
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
				'Content-Length': bodyBuffer.length.toString()
			},
			json: false,
			encoding: null as any, // Important for binary data
			timeout: 30000 // 30 seconds timeout
		};

		try {
			console.log('Sending request to:', requestOptions.url);
			console.log('Request body length:', bodyBuffer.length);
			console.log('Content-Type:', requestOptions.headers?.['Content-Type']);
			
			const response = await this.executeFunctions.helpers.request(requestOptions);
			const responseData = typeof response === 'string' ? JSON.parse(response) : response;

			return {
				sessionId: responseData.session_id,
				status: {
					sessionId: responseData.session_id,
					status: responseData.status || 'processing',
					message: responseData.message || 'Processing started'
				}
			};
		} catch (error: any) {
			console.error('Request failed:', error);
			
			// Handle different error types
			if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
				throw new Error(`OCR Engine API is not accessible at ${this.baseUrl}. Please check if the service is running.`);
			}
			
			if (error.code === 'ETIMEDOUT') {
				throw new Error(`Request timed out after ${(requestOptions.timeout || 300000) / 1000} seconds. The OCR Engine API may be overloaded.`);
			}
			
			const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
			throw new Error(`Failed to submit OCR job: ${errorMessage}`);
		}
	}

	async getStatus(sessionId: string): Promise<SessionStatus> {
		const requestOptions: IHttpRequestOptions = {
			method: 'GET' as IHttpRequestMethods,
			url: `${this.baseUrl}/api/sessions/${sessionId}/status`,
			json: true,
			timeout: 30000,
		};

		try {
			const response = await this.executeFunctions.helpers.request(requestOptions);
			
			return {
				sessionId,
				status: response.status,
				progress: response.progress,
				message: response.message,
				results: response.results,
				error: response.error
			};
		} catch (error: any) {
			throw new Error(`Failed to get session status: ${error.message}`);
		}
	}

	async waitForCompletion(
		sessionId: string, 
		maxWaitTime: number = 300000, // 5 minutes
		pollInterval: number = 2000    // 2 seconds
	): Promise<SessionStatus> {
		const startTime = Date.now();
		
		while (Date.now() - startTime < maxWaitTime) {
			const status = await this.getStatus(sessionId);
			
			if (status.status === 'completed' || status.status === 'failed') {
				return status;
			}
			
			// Wait before polling again
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}
		
		throw new Error(`OCR processing timed out after ${maxWaitTime / 1000} seconds`);
	}

	async downloadResult(sessionId: string, format: string): Promise<string> {
		const requestOptions: IHttpRequestOptions = {
			method: 'GET' as IHttpRequestMethods,
			url: `${this.baseUrl}/api/sessions/${sessionId}/download/${format}`,
			json: false,
			timeout: 60000,
		};

		try {
			const response = await this.executeFunctions.helpers.request(requestOptions);
			return typeof response === 'string' ? response : JSON.stringify(response);
		} catch (error: any) {
			throw new Error(`Failed to download result: ${error.message}`);
		}
	}

	async downloadBulk(sessionId: string): Promise<Buffer> {
		const requestOptions: IHttpRequestOptions = {
			method: 'GET' as IHttpRequestMethods,
			url: `${this.baseUrl}/api/sessions/${sessionId}/download-all`,
			returnFullResponse: true, // Get full response
			timeout: 120000,
		};

		try {
			const response = await this.executeFunctions.helpers.request(requestOptions);
			return Buffer.isBuffer(response) ? response : Buffer.from(response);
		} catch (error: any) {
			throw new Error(`Failed to download bulk results: ${error.message}`);
		}
	}

	async checkHealth(): Promise<{ status: string; version?: string }> {
		const requestOptions: IHttpRequestOptions = {
			method: 'GET' as IHttpRequestMethods,
			url: `${this.baseUrl}/health`,
			json: true,
			timeout: 10000,
		};

		try {
			const response = await this.executeFunctions.helpers.request(requestOptions);
			return response;
		} catch (error: any) {
			throw new Error(`OCR Engine health check failed: ${error.message}`);
		}
	}

	async getSupportedFormats(): Promise<string[]> {
		const requestOptions: IHttpRequestOptions = {
			method: 'GET' as IHttpRequestMethods,
			url: `${this.baseUrl}/api/formats`,
			json: true,
			timeout: 10000,
		};

		try {
			const response = await this.executeFunctions.helpers.request(requestOptions);
			return response.formats || [];
		} catch (error: any) {
			// Return default formats if endpoint is not available
			return ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'docx', 'pptx', 'xlsx', 'epub', 'mobi'];
		}
	}

	// Cloud OCR methods for direct integration
	async processWithTesseract(buffer: Buffer, options: ProcessingOptions): Promise<OCRResult> {
		// This would implement Tesseract.js processing
		throw new Error('Direct Tesseract processing not implemented in this version');
	}

	async processWithGoogleVision(
		buffer: Buffer, 
		options: ProcessingOptions, 
		credentials: any
	): Promise<OCRResult> {
		// This would implement Google Cloud Vision API calls
		throw new Error('Direct Google Vision processing not implemented in this version');
	}

	async processWithAzureVision(
		buffer: Buffer, 
		options: ProcessingOptions, 
		credentials: any
	): Promise<OCRResult> {
		// This would implement Azure Computer Vision API calls
		throw new Error('Direct Azure Vision processing not implemented in this version');
	}
}
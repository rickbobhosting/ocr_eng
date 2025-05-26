import { IExecuteFunctions, IHttpRequestOptions, IHttpRequestMethods } from 'n8n-workflow';
import { OCREngineCredentials, ProcessingOptions, SessionStatus, OCRResult } from './types';
import FormData from 'form-data';

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
		const formData = new FormData();
		formData.append('files', buffer, {
			filename: fileName,
			contentType: mimeType
		});

		// Add processing options to form data
		formData.append('output_format', options.outputFormat);
		formData.append('language', options.languages.join(','));

		if (options.enhanceLlm) {
			formData.append('enhance_llm', 'true');
			if (options.llmProvider) {
				formData.append('llm_provider', options.llmProvider);
			}
			if (options.geminiModel) {
				formData.append('gemini_model', options.geminiModel);
			}
		}

		if (options.extractImages !== undefined) {
			formData.append('extract_images', options.extractImages.toString());
		}

		if (options.pageRange) {
			formData.append('page_range', options.pageRange);
		}

		// Add API keys if provided
		if (credentials.geminiApiKey) {
			formData.append('gemini_api_key', credentials.geminiApiKey);
		}

		if (credentials.ollamaUrl) {
			formData.append('ollama_url', credentials.ollamaUrl);
		}

		if (credentials.ollamaModel) {
			formData.append('ollama_model', credentials.ollamaModel);
		}

		// Choose the correct endpoint based on OCR engine
		let endpoint = '/api/upload';
		if (options.ocrEngine === 'gemini-direct') {
			endpoint = '/api/gemini-direct';
		}

		const requestOptions: IHttpRequestOptions = {
			method: 'POST' as IHttpRequestMethods,
			url: `${this.baseUrl}${endpoint}`,
			body: formData,
			headers: {
				...formData.getHeaders()
			},
			json: false,
			timeout: 300000, // 5 minutes timeout
		};

		try {
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
			throw new Error(`Failed to submit OCR job: ${error.message}`);
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
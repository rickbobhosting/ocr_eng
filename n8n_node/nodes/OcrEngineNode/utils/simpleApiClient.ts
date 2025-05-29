import { IExecuteFunctions, IHttpRequestOptions, IHttpRequestMethods } from 'n8n-workflow';
import { ProcessingOptions, SessionStatus, OCREngineCredentials } from './types';
import axios from 'axios';
import FormData from 'form-data';

export class SimpleOCREngineApiClient {
	private baseUrl: string;
	private executeFunctions: IExecuteFunctions;

	constructor(baseUrl: string, executeFunctions: IExecuteFunctions) {
		this.baseUrl = baseUrl.replace(/\/$/, '');
		this.executeFunctions = executeFunctions;
	}

	async getStatus(sessionId: string): Promise<SessionStatus> {
		// Try axios first as it might handle the connection better
		try {
			console.log('Getting status using axios from:', `${this.baseUrl}/api/sessions/${sessionId}/status`);
			const response = await axios.get(`${this.baseUrl}/api/sessions/${sessionId}/status`, {
				timeout: 10000,
				headers: {
					'Accept': 'application/json'
				}
			});
			
			console.log('Status response:', response.data);
			
			return {
				sessionId,
				status: response.data.status,
				progress: response.data.progress,
				message: response.data.message,
				results: response.data.results,
				error: response.data.error
			};
		} catch (axiosError: any) {
			console.error('Axios status request failed:', axiosError.message);
			
			// Fallback to native HTTP
			const http = require('http');
			const url = new URL(`${this.baseUrl}/api/sessions/${sessionId}/status`);
			
			return new Promise((resolve, reject) => {
				const options = {
					hostname: url.hostname,
					port: url.port || 80,
					path: url.pathname,
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'Connection': 'close'  // Force connection close to avoid hanging
					},
					timeout: 10000
				};
				
				console.log('Getting status using native HTTP from:', `${url.hostname}:${url.port}${url.pathname}`);
				
				const req = http.request(options, (res: any) => {
					let data = '';
					res.on('data', (chunk: any) => data += chunk);
					res.on('end', () => {
						try {
							const response = JSON.parse(data);
							console.log('Native status response:', response);
							resolve({
								sessionId,
								status: response.status,
								progress: response.progress,
								message: response.message,
								results: response.results,
								error: response.error
							});
						} catch (e) {
							reject(new Error(`Invalid status response: ${data}`));
						}
					});
				});
				
				req.on('timeout', () => {
					req.destroy();
					reject(new Error('Status request timed out'));
				});
				
				req.on('error', (e: any) => {
					console.error('Native status request error:', e);
					reject(new Error(`Failed to get status: ${e.message}`));
				});
				
				req.end();
			});
		}
	}

	async waitForCompletion(
		sessionId: string, 
		maxWaitTime: number = 300000,
		pollInterval: number = 2000
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

	async downloadResult(sessionId: string, filename: string): Promise<string> {
		const downloadUrl = `${this.baseUrl}/api/sessions/${sessionId}/download/${filename}`;
		
		// Try axios first
		try {
			console.log('Downloading result using axios from:', downloadUrl);
			const response = await axios.get(downloadUrl, {
				timeout: 30000,
				responseType: 'text'
			});
			
			console.log('Downloaded result length:', response.data.length);
			return response.data;
		} catch (axiosError: any) {
			console.error('Axios download failed:', axiosError.message);
			
			// Fallback to native HTTP
			const http = require('http');
			const url = new URL(downloadUrl);
			
			return new Promise((resolve, reject) => {
				const options = {
					hostname: url.hostname,
					port: url.port || 80,
					path: url.pathname,
					method: 'GET',
					headers: {
						'Connection': 'close'
					},
					timeout: 30000
				};
				
				console.log('Downloading result using native HTTP from:', `${url.hostname}:${url.port}${url.pathname}`);
				
				const req = http.request(options, (res: any) => {
					let data = '';
					res.on('data', (chunk: any) => data += chunk);
					res.on('end', () => {
						console.log('Downloaded result length:', data.length);
						resolve(data);
					});
				});
				
				req.on('timeout', () => {
					req.destroy();
					reject(new Error('Download request timed out'));
				});
				
				req.on('error', (e: any) => {
					console.error('Download request error:', e);
					reject(new Error(`Failed to download result: ${e.message}`));
				});
				
				req.end();
			});
		}
	}

	async processFileSimple(
		buffer: Buffer,
		fileName: string,
		mimeType: string,
		options: ProcessingOptions,
		credentials: OCREngineCredentials
	): Promise<{ sessionId: string; status: SessionStatus }> {
		// Use axios directly instead of n8n request helper
		const form = new FormData();
		
		// Add file
		form.append('files', buffer, {
			filename: fileName,
			contentType: mimeType
		});
		
		// Add other fields
		form.append('output_format', options.outputFormat);
		form.append('language', options.languages.join(','));
		
		if (options.ocrEngine) {
			form.append('ocr_engine', options.ocrEngine);
		}
		
		// Add extract images option
		form.append('extract_images', options.extractImages ? 'true' : 'false');
		console.log('Axios: Adding extract_images:', options.extractImages ? 'true' : 'false');
		
		if (options.enhanceLlm) {
			console.log('Axios: Adding LLM fields - enhanceLlm:', options.enhanceLlm, 'provider:', options.llmProvider);
			console.log('Axios: Model details - ollamaModel:', options.ollamaModel, 'geminiModel:', options.geminiModel);
			form.append('use_llm', 'true');  // API expects 'use_llm' not 'llm'
			if (options.llmProvider) {
				console.log('Axios: Adding llm_provider:', options.llmProvider);
				form.append('llm_provider', options.llmProvider);
				
				// Add provider-specific parameters
				if (options.llmProvider === 'ollama') {
					form.append('ollama_base_url', 'http://localhost:11434');
					if (options.ollamaModel) {
						console.log('Axios: Setting ollama_model to:', options.ollamaModel);
						form.append('ollama_model', options.ollamaModel);
					} else {
						console.log('Axios: WARNING: ollamaModel is undefined!');
					}
				} else if (options.llmProvider === 'gemini') {
					if (options.geminiModel) {
						console.log('Axios: Setting gemini_model to:', options.geminiModel);
						form.append('gemini_model', options.geminiModel);
					}
				}
			}
		}
		
		if (credentials.geminiApiKey) {
			form.append('gemini_api_key', credentials.geminiApiKey);
		}
		
		const endpoint = options.ocrEngine === 'gemini-direct' ? '/api/gemini-direct' : '/api/upload';
		const url = `${this.baseUrl}${endpoint}`;
		
		console.log('Using axios to send request to:', url);
		console.log('Form boundary:', form.getBoundary());
		
		try {
			const response = await axios.post(url, form, {
				headers: {
					...form.getHeaders()
				},
				timeout: 30000,
				maxBodyLength: Infinity,
				maxContentLength: Infinity
			});
			
			console.log('Response received:', response.data);
			
			return {
				sessionId: response.data.session_id,
				status: {
					sessionId: response.data.session_id,
					status: response.data.status || 'processing',
					message: response.data.message || 'Processing started'
				}
			};
		} catch (error: any) {
			console.error('Axios error:', error.message);
			if (error.response) {
				console.error('Response data:', error.response.data);
			}
			throw new Error(`Failed to submit OCR job: ${error.message}`);
		}
	}

	// Try with a basic HTTP request using native Node.js
	async processFileNative(
		buffer: Buffer,
		fileName: string,
		mimeType: string,
		options: ProcessingOptions,
		credentials: OCREngineCredentials
	): Promise<{ sessionId: string; status: SessionStatus }> {
		const http = require('http');
		const endpoint = options.ocrEngine === 'gemini-direct' ? '/api/gemini-direct' : '/api/upload';
		
		const boundary = `----FormBoundary${Date.now()}`;
		const parts: Buffer[] = [];
		
		// Helper to add fields
		const addField = (name: string, value: string) => {
			parts.push(Buffer.from(`--${boundary}\r\n`));
			parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
			parts.push(Buffer.from(`${value}\r\n`));
		};
		
		// Add fields
		addField('output_format', options.outputFormat);
		addField('language', options.languages.join(','));
		if (endpoint === '/api/upload') {
			addField('ocr_engine', options.ocrEngine);
		}
		
		// Add extract images option
		addField('extract_images', options.extractImages ? 'true' : 'false');
		console.log('Adding extract_images:', options.extractImages ? 'true' : 'false');
		
		// Add LLM enhancement options
		console.log('LLM options check - enhanceLlm:', options.enhanceLlm, 'llmProvider:', options.llmProvider);
		console.log('Model details - ollamaModel:', options.ollamaModel, 'geminiModel:', options.geminiModel);
		if (options.enhanceLlm) {
			console.log('Adding LLM fields to request');
			addField('use_llm', 'true');  // API expects 'use_llm' not 'llm'
			if (options.llmProvider) {
				console.log('Adding llm_provider:', options.llmProvider);
				addField('llm_provider', options.llmProvider);
				
				// Add provider-specific parameters
				if (options.llmProvider === 'ollama') {
					// TODO: Get Ollama URL from connected model node
					// For now, use a default URL
					console.log('Adding Ollama fields - base_url: http://localhost:11434, model:', options.ollamaModel);
					addField('ollama_base_url', 'http://localhost:11434');
					if (options.ollamaModel) {
						console.log('Setting ollama_model to:', options.ollamaModel);
						addField('ollama_model', options.ollamaModel);
					} else {
						console.log('WARNING: ollamaModel is undefined!');
					}
				} else if (options.llmProvider === 'gemini') {
					if (credentials.geminiApiKey) {
						console.log('Adding gemini_api_key');
						addField('gemini_api_key', credentials.geminiApiKey);
					}
					if (options.geminiModel) {
						console.log('Setting gemini_model to:', options.geminiModel);
						addField('gemini_model', options.geminiModel);
					}
				}
			}
		} else {
			console.log('LLM enhancement not enabled');
		}
		
		// Add file
		parts.push(Buffer.from(`--${boundary}\r\n`));
		parts.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n`));
		parts.push(Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`));
		parts.push(buffer);
		parts.push(Buffer.from('\r\n'));
		parts.push(Buffer.from(`--${boundary}--\r\n`));
		
		const body = Buffer.concat(parts);
		
		return new Promise((resolve, reject) => {
			const url = new URL(`${this.baseUrl}${endpoint}`);
			const options = {
				hostname: url.hostname,
				port: url.port || 80,
				path: url.pathname,
				method: 'POST',
				headers: {
					'Content-Type': `multipart/form-data; boundary=${boundary}`,
					'Content-Length': body.length
				}
			};
			
			console.log('Native HTTP request to:', `${url.hostname}:${url.port}${url.pathname}`);
			console.log('Request body preview (first 1000 chars):');
			console.log(body.toString().substring(0, 1000));
			console.log('Total body length:', body.length);
			
			const req = http.request(options, (res: any) => {
				let data = '';
				res.on('data', (chunk: any) => data += chunk);
				res.on('end', () => {
					try {
						const responseData = JSON.parse(data);
						console.log('Native response:', responseData);
						resolve({
							sessionId: responseData.session_id,
							status: {
								sessionId: responseData.session_id,
								status: responseData.status || 'processing',
								message: responseData.message || 'Processing started'
							}
						});
					} catch (e) {
						reject(new Error(`Invalid response: ${data}`));
					}
				});
			});
			
			req.on('error', (e: any) => {
				console.error('Native request error:', e);
				reject(new Error(`Request failed: ${e.message}`));
			});
			
			req.write(body);
			req.end();
		});
	}
}
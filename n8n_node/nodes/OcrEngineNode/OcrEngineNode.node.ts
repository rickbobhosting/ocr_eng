import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	IBinaryData,
	NodeConnectionType,
} from 'n8n-workflow';

import { OCREngineApiClient } from './utils/apiClient';
import { SimpleOCREngineApiClient } from './utils/simpleApiClient';
import { validateFile, validateProcessingOptions } from './utils/validation';
import { ProcessingOptions, OCREngineCredentials } from './utils/types';

export class OcrEngineNode implements INodeType {
	constructor() {
		console.error('CONSTRUCTOR DEBUG: OCR Engine Node is being loaded');
	}
	
	description: INodeTypeDescription = {
		displayName: 'OCR Engine',
		name: 'ocrEngineNode',
		icon: 'file:icon.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["ocrEngine"]}} - {{$parameter["outputFormat"]}}',
		description: 'Extract text from images and documents using advanced OCR engines with GPU acceleration and LLM enhancement',
		defaults: {
			name: 'OCR Engine',
		},
		inputs: [
			NodeConnectionType.Main,
			{
				type: NodeConnectionType.AiLanguageModel,
				displayName: 'AI Model',
				required: false,
				maxConnections: 1,
			}
		],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'ocrEngineApi',
				required: true
			}
		],
		properties: [
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the file(s) to process',
			},
			{
				displayName: 'OCR Engine',
				name: 'ocrEngine',
				type: 'options',
				options: [
					{
						name: 'Marker OCR (GPU Accelerated)',
						value: 'marker',
						description: 'Advanced document processing with layout detection and reading order analysis'
					},
					{
						name: 'Gemini Direct OCR',
						value: 'gemini-direct',
						description: 'Direct AI processing (REQUIRES: Enhance with LLM = ON, LLM Provider = Gemini, Images only)'
					}
				],
				default: 'marker',
				description: 'OCR engine to use for text extraction'
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'Markdown',
						value: 'markdown',
						description: 'Clean, structured text with formatting'
					},
					{
						name: 'JSON',
						value: 'json',
						description: 'Hierarchical document data with metadata'
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Web-ready format with styling'
					},
					{
						name: 'PDF',
						value: 'pdf',
						description: 'Generated from Markdown with professional styling'
					}
				],
				default: 'markdown',
				description: 'Output format for the extracted text'
			},
			{
				displayName: 'Languages',
				name: 'languages',
				type: 'multiOptions',
				options: [
					{ name: 'English', value: 'eng' },
					{ name: 'Spanish', value: 'spa' },
					{ name: 'French', value: 'fra' },
					{ name: 'German', value: 'deu' },
					{ name: 'Italian', value: 'ita' },
					{ name: 'Portuguese', value: 'por' },
					{ name: 'Dutch', value: 'nld' },
					{ name: 'Russian', value: 'rus' },
					{ name: 'Chinese Simplified', value: 'chi_sim' },
					{ name: 'Chinese Traditional', value: 'chi_tra' },
					{ name: 'Japanese', value: 'jpn' },
					{ name: 'Korean', value: 'kor' },
					{ name: 'Arabic', value: 'ara' },
					{ name: 'Hindi', value: 'hin' },
					{ name: 'Auto-detect', value: 'auto' }
				],
				default: ['eng'],
				description: 'Languages to detect and extract'
			},
			{
				displayName: 'Processing Options',
				name: 'processingOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {
					enhanceLlm: '={{$parameter["ocrEngine"] === "gemini-direct" ? true : false}}',
					useModel: '={{$parameter["ocrEngine"] === "gemini-direct" ? "gemini" : "ollama"}}'
				},
				options: [
					{
						displayName: 'Enhance with LLM',
						name: 'enhanceLlm',
						type: 'boolean',
						default: false,
						description: 'Use LLM to enhance OCR accuracy (Auto-enabled for Gemini Direct OCR)'
					},
					{
						displayName: 'Use Model',
						name: 'useModel',
						type: 'options',
						displayOptions: {
							show: {
								enhanceLlm: [true]
							}
						},
						options: [
							{
								name: 'Auto-Detect (Recommended)',
								value: 'auto',
								description: 'Automatically detect provider from connected AI model'
							},
							{
								name: 'Force Ollama',
								value: 'ollama',
								description: 'Force Ollama provider (override auto-detection)'
							},
							{
								name: 'Force Gemini',
								value: 'gemini',
								description: 'Force Gemini provider (override auto-detection)'
							}
						],
						default: 'auto',
						description: 'Model provider selection - auto-detect is recommended'
					},
					{
						displayName: 'Model Name Override',
						name: 'modelNameOverride',
						type: 'string',
						displayOptions: {
							show: {
								enhanceLlm: [true]
							}
						},
						default: '',
						placeholder: 'e.g., gemma3:12b for Ollama, models/gemini-1.5-flash-8b for Gemini',
						description: 'Specify the exact model name to use. Required until AI node integration is complete.',
						hint: 'Enter the model name from your connected AI node (e.g., gemma3:12b from Ollama or models/gemini-1.5-flash-8b from Gemini)'
					},
					{
						displayName: 'Extract Images',
						name: 'extractImages',
						type: 'boolean',
						default: false,
						description: 'Extract and save embedded images from documents'
					},
					{
						displayName: 'Confidence Threshold',
						name: 'confidenceThreshold',
						type: 'number',
						default: 60,
						typeOptions: {
							minValue: 0,
							maxValue: 100
						},
						description: 'Minimum confidence level for text recognition (0-100)',
						displayOptions: {
							show: {
								'/ocrEngine': ['tesseract', 'google-vision', 'azure-vision']
							}
						}
					}
				]
			},
			{
				displayName: 'Processing Timeout (seconds)',
				name: 'processingTimeout',
				type: 'number',
				default: 300,
				typeOptions: {
					minValue: 30,
					maxValue: 1800
				},
				description: 'Maximum time to wait for processing completion'
			},
		]
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		console.error('FORCE DEBUG: OCR Node execution started');
		console.error('FORCE DEBUG: Number of items:', items.length);

		for (let i = 0; i < items.length; i++) {
			try {
				// Get node parameters
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const ocrEngine = this.getNodeParameter('ocrEngine', i) as string;
				const outputFormat = this.getNodeParameter('outputFormat', i) as string;
				const languages = this.getNodeParameter('languages', i) as string[];
				const processingOptions = this.getNodeParameter('processingOptions', i, {}) as any;
				const processingTimeout = this.getNodeParameter('processingTimeout', i, 300) as number;

				// For now, we'll simulate having models connected
				// In a real implementation, we would properly integrate with n8n's AI system
				// The issue is that AI nodes in n8n work differently and require specific integration
				let hasConnectedModel = false;
				
				// Check if we should proceed with LLM enhancement
				if (processingOptions.enhanceLlm) {
					// For now, we'll assume a model is connected if LLM is enabled
					// This allows the node to work while we figure out the proper AI node integration
					hasConnectedModel = true;
					console.log('LLM enhancement enabled - proceeding with configured credentials');
				}

				// Auto-enable LLM for Gemini Direct OCR
				if (ocrEngine === 'gemini-direct') {
					processingOptions.enhanceLlm = true;
					hasConnectedModel = true; // Gemini Direct uses API credentials
				}

				// Get binary data
				const binaryData = items[i].binary?.[binaryPropertyName];
				if (!binaryData) {
					throw new NodeOperationError(
						this.getNode(),
						`No binary data found in property: ${binaryPropertyName}`,
						{ itemIndex: i }
					);
				}

				// Get file buffer
				const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
				
				// Debug logging
				console.log('OCR Node Debug - Binary data:', {
					hasBuffer: !!buffer,
					bufferLength: buffer?.length,
					isBuffer: Buffer.isBuffer(buffer),
					binaryData: {
						fileName: binaryData.fileName,
						fileExtension: binaryData.fileExtension,
						mimeType: binaryData.mimeType
					}
				});
				
				const fileName = binaryData.fileName || `document_${i}.${binaryData.fileExtension || 'pdf'}`;
				const mimeType = binaryData.mimeType || 'application/octet-stream';

				// Validate file
				const validation = validateFile(mimeType, buffer.length, ocrEngine);
				if (!validation.isValid) {
					throw new NodeOperationError(
						this.getNode(),
						validation.errorMessage || 'File validation failed',
						{ itemIndex: i }
					);
				}

				// Build processing options
				console.log('Processing options from UI:', processingOptions);
				console.error('DEBUG: Raw processingOptions keys:', Object.keys(processingOptions));
				console.error('DEBUG: enhanceLlm value:', processingOptions.enhanceLlm);
				console.error('DEBUG: useModel value:', processingOptions.useModel);
				console.error('DEBUG: extractImages value:', processingOptions.extractImages);
				
				// Handle LLM configuration based on useModel selection
				let llmProvider: 'ollama' | 'gemini' | undefined;
				let modelName: string | undefined;
				
				if (processingOptions.enhanceLlm) {
					const useModel = processingOptions.useModel || 'auto';
					const modelOverride = processingOptions.modelNameOverride || '';
					
					console.log('DEBUG: LLM Enhancement enabled');
					console.log('DEBUG: useModel =', useModel);
					console.log('DEBUG: modelOverride =', modelOverride);
					console.log('DEBUG: processingOptions =', JSON.stringify(processingOptions, null, 2));
					
					// Try to extract model from connected AI node
					try {
						console.log('Attempting to get model from connected AI node...');
						
						let extractedModelName = null;
						let detectedProvider = null;
						
						// Try getInputConnectionData for AI input
						try {
							console.error('CRITICAL: About to call getInputConnectionData with params:', {
								connectionType: NodeConnectionType.AiLanguageModel,
								itemIndex: i,
								inputIndex: 0
							});
							
							const connectionData = await this.getInputConnectionData(NodeConnectionType.AiLanguageModel, i, 0);
							console.error('CRITICAL: AI connection data:', JSON.stringify(connectionData, null, 2));
							console.error('CRITICAL: Connection data type:', typeof connectionData);
							console.error('CRITICAL: Connection data is null?', connectionData === null);
							console.error('CRITICAL: Connection data is undefined?', connectionData === undefined);
							
							if (connectionData && typeof connectionData === 'object') {
								const data = connectionData as any;
								
								// Try multiple possible property paths for model name
								extractedModelName = data.modelName || 
												   data.model ||
												   data.name ||
												   data.parameters?.modelName ||
												   data.parameters?.model ||
												   data.config?.model ||
												   data.config?.modelName;
								
								// Auto-detect provider based on model name and connection data
								if (extractedModelName) {
									const modelNameLower = extractedModelName.toLowerCase();
									if (modelNameLower.includes('gemini') || modelNameLower.includes('models/gemini')) {
										detectedProvider = 'gemini';
									} else {
										// Default to Ollama for non-Gemini models (llama, mistral, etc.)
										detectedProvider = 'ollama';
									}
								}
								
								// Also try to detect from node type or connection metadata
								if (!detectedProvider && data.nodeType) {
									if (data.nodeType.includes('gemini') || data.nodeType.includes('Gemini')) {
										detectedProvider = 'gemini';
									} else if (data.nodeType.includes('ollama') || data.nodeType.includes('Ollama')) {
										detectedProvider = 'ollama';
									}
								}
								
								console.error('CRITICAL: 🔍 Extracted model name:', extractedModelName);
								console.error('CRITICAL: 🤖 Detected provider:', detectedProvider);
								console.error('CRITICAL: 📊 Full connection data structure:', Object.keys(data));
							}
						} catch (connError: any) {
							console.log('Connection data method failed:', connError?.message);
						}
						
						// Smart auto-detection with override support
						if (useModel === 'auto') {
							// Auto-detection mode
							if (detectedProvider && extractedModelName) {
								llmProvider = detectedProvider as 'ollama' | 'gemini';
								modelName = extractedModelName;
								console.error('CRITICAL: ✅ Auto-detected provider:', llmProvider, 'with model:', modelName);
							} else {
								// No model connected, use fallback
								llmProvider = 'ollama';
								modelName = modelOverride || 'llama3.2:3b';
								console.error('CRITICAL: ⚠️ Auto-detect failed - using fallback Ollama provider with model:', modelName);
							}
						} else if (useModel === 'ollama') {
							// Force Ollama override
							llmProvider = 'ollama';
							modelName = extractedModelName || modelOverride || 'llama3.2:3b';
							console.error('CRITICAL: 🔧 Forced Ollama provider with model:', modelName);
						} else if (useModel === 'gemini') {
							// Force Gemini override
							llmProvider = 'gemini';
							modelName = extractedModelName || modelOverride || 'gemini-1.5-flash';
							console.error('CRITICAL: 🔧 Forced Gemini provider with model:', modelName);
						} else {
							// Legacy fallback
							llmProvider = 'ollama';
							modelName = modelOverride || 'llama3.2:3b';
							console.error('CRITICAL: ⚠️ Legacy fallback - using default Ollama provider with model:', modelName);
						}
						
					} catch (error) {
						console.log('Error extracting model from connected node:', error);
						// Fallback to configured provider and default model
						if (useModel === 'gemini') {
							llmProvider = 'gemini';
							modelName = modelOverride || 'gemini-1.5-flash';
						} else {
							llmProvider = 'ollama';
							modelName = modelOverride || 'llama3.2:3b';
						}
					}
				}
				
				// For Gemini Direct, force Gemini settings
				if (ocrEngine === 'gemini-direct') {
					processingOptions.enhanceLlm = true;
					llmProvider = 'gemini';
					if (!modelName) {
						modelName = 'gemini-1.5-flash';
					}
				}
				
				const options: ProcessingOptions = {
					ocrEngine: ocrEngine as any,
					outputFormat: outputFormat as any,
					languages,
					enhanceLlm: processingOptions.enhanceLlm || false,
					llmProvider: llmProvider,
					geminiModel: llmProvider === 'gemini' ? modelName : undefined,
					ollamaModel: llmProvider === 'ollama' ? modelName : undefined,
					extractImages: processingOptions.extractImages || false,
					confidenceThreshold: processingOptions.confidenceThreshold
				};
				
				console.log('Built options object:', options);

				// Validate processing options
				const optionsValidation = validateProcessingOptions(options);
				if (!optionsValidation.isValid) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid processing options: ${optionsValidation.errors.join(', ')}`,
						{ itemIndex: i }
					);
				}

				// Get credentials - both OCR engines use the same credentials
				const credentials = await this.getCredentials('ocrEngineApi', i) as OCREngineCredentials;
				console.log('OCR Node Debug - Credentials:', {
					hasBaseUrl: !!credentials.baseUrl,
					baseUrl: credentials.baseUrl,
					hasGeminiKey: !!credentials.geminiApiKey
				});

				// Use simple API client to bypass n8n request helper issues
				const simpleClient = new SimpleOCREngineApiClient(credentials.baseUrl, this);
				
				console.log('Using simple API client to process file');
				
				// Try native HTTP first
				let sessionId: string;
				let status: any;
				
				try {
					console.log('Attempting native HTTP request...');
					const result = await simpleClient.processFileNative(
						buffer,
						fileName,
						mimeType,
						options,
						credentials
					);
					sessionId = result.sessionId;
					status = result.status;
				} catch (nativeError: any) {
					console.error('Native HTTP failed:', nativeError.message);
					console.log('Attempting axios request...');
					
					// Fallback to axios
					try {
						const result = await simpleClient.processFileSimple(
							buffer,
							fileName,
							mimeType,
							options,
							credentials
						);
						sessionId = result.sessionId;
						status = result.status;
					} catch (axiosError: any) {
						console.error('Axios failed:', axiosError.message);
						throw new NodeOperationError(
							this.getNode(),
							`Failed to submit OCR job: ${axiosError.message}`,
							{ itemIndex: i }
						);
					}
				}

				// Wait for completion using simple client to avoid socket hang up
				console.log('Waiting for completion of session:', sessionId);
				
				// Add a small delay to ensure the API is ready
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				const finalStatus = await simpleClient.waitForCompletion(
					sessionId,
					processingTimeout * 1000
				);

				if (finalStatus.status === 'failed') {
					throw new NodeOperationError(
						this.getNode(),
						`OCR processing failed: ${finalStatus.error || 'Unknown error'}`,
						{ itemIndex: i }
					);
				}

				// Download the actual results
				let extractedText = '';
				let results: any = {};
				
				if (finalStatus.status === 'completed') {
					try {
						console.log(`Downloading ${outputFormat} results for session:`, sessionId);
						
						// Download result in the requested format
						// Map output format to file extension (API uses .md not .markdown)
						const fileExtension = outputFormat === 'markdown' ? 'md' : outputFormat;
						const downloadFilename = `${fileName.replace(/\.[^/.]+$/, '')}.${fileExtension}`;
						console.log('Downloading file:', downloadFilename);
						
						const downloadedContent = await simpleClient.downloadResult(sessionId, downloadFilename);
						
						// Parse if JSON format
						if (outputFormat === 'json') {
							try {
								results = JSON.parse(downloadedContent);
								extractedText = JSON.stringify(results, null, 2);
							} catch (e) {
								// If not valid JSON, use as is
								extractedText = downloadedContent;
								results = { raw: downloadedContent };
							}
						} else {
							extractedText = downloadedContent;
							results = { [outputFormat]: downloadedContent };
						}
						
						console.log('Downloaded result length:', extractedText.length);
					} catch (downloadError: any) {
						console.error('Failed to download results:', downloadError.message);
						// Continue with empty results rather than failing completely
					}
				}
				
				const result = {
					sessionId,
					fileName,
					processingEngine: ocrEngine,
					outputFormat,
					status: finalStatus.status,
					results,
					extractedText,
					metadata: {
						fileName,
						fileSize: buffer.length,
						mimeType,
						ocrEngine,
						languages: languages.join(','),
						processingOptions: options,
						timestamp: new Date().toISOString()
					}
				};

				// Add binary data back if needed
				const newBinaryData: { [key: string]: IBinaryData } = {};
				if (binaryData) {
					newBinaryData[binaryPropertyName] = binaryData;
				}

				returnData.push({
					json: result,
					binary: newBinaryData,
					pairedItem: { item: i }
				});

			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							fileName: items[i].binary?.[this.getNodeParameter('binaryPropertyName', i) as string]?.fileName,
							itemIndex: i
						},
						pairedItem: { item: i }
					});
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}
}
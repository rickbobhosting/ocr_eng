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
import { validateFile, validateProcessingOptions } from './utils/validation';
import { ProcessingOptions, OCREngineCredentials } from './utils/types';

export class OcrEngineNode implements INodeType {
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
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'ocrEngineApi',
				required: true,
				displayOptions: {
					show: {
						ocrEngine: ['marker', 'gemini-direct']
					}
				}
			},
			{
				name: 'googleCloudApi',
				required: false,
				displayOptions: {
					show: {
						ocrEngine: ['google-vision']
					}
				}
			},
			{
				name: 'azureComputerVision',
				required: false,
				displayOptions: {
					show: {
						ocrEngine: ['azure-vision']
					}
				}
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
						description: 'Direct AI processing bypassing traditional pipeline (images only)'
					},
					{
						name: 'Tesseract (Local)',
						value: 'tesseract',
						description: 'Local Tesseract OCR processing'
					},
					{
						name: 'Google Cloud Vision',
						value: 'google-vision',
						description: 'Google Cloud Vision API'
					},
					{
						name: 'Azure Computer Vision',
						value: 'azure-vision',
						description: 'Microsoft Azure Computer Vision API'
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
				default: {},
				options: [
					{
						displayName: 'Enhance with LLM',
						name: 'enhanceLlm',
						type: 'boolean',
						default: false,
						description: 'Use Large Language Model to enhance OCR accuracy and structure'
					},
					{
						displayName: 'LLM Provider',
						name: 'llmProvider',
						type: 'options',
						displayOptions: {
							show: {
								enhanceLlm: [true]
							}
						},
						options: [
							{
								name: 'Ollama (Local)',
								value: 'ollama',
								description: 'Local LLM processing with Ollama'
							},
							{
								name: 'Google Gemini',
								value: 'gemini',
								description: 'Cloud-based processing with Gemini'
							}
						],
						default: 'ollama',
						description: 'LLM provider for text enhancement'
					},
					{
						displayName: 'Gemini Model',
						name: 'geminiModel',
						type: 'options',
						displayOptions: {
							show: {
								llmProvider: ['gemini']
							}
						},
						options: [
							{
								name: 'Gemini 2.5 Flash Preview (Latest)',
								value: 'gemini-2.5-flash-preview-05-20',
								description: 'Latest with adaptive thinking (Recommended)'
							},
							{
								name: 'Gemini 2.5 Pro Preview',
								value: 'gemini-2.5-pro-preview-05-06',
								description: 'Advanced reasoning and multimodal understanding'
							},
							{
								name: 'Gemini 2.0 Flash',
								value: 'gemini-2.0-flash',
								description: 'Stable with next-gen features'
							},
							{
								name: 'Gemini 2.0 Flash Lite',
								value: 'gemini-2.0-flash-lite',
								description: 'Cost-efficient and low latency'
							},
							{
								name: 'Gemini 1.5 Flash',
								value: 'gemini-1.5-flash',
								description: 'Fast and versatile (Production stable)'
							},
							{
								name: 'Gemini 1.5 Pro',
								value: 'gemini-1.5-pro',
								description: 'High quality processing'
							}
						],
						default: 'gemini-2.5-flash-preview-05-20',
						description: 'Gemini model to use for processing'
					},
					{
						displayName: 'Extract Images',
						name: 'extractImages',
						type: 'boolean',
						default: false,
						description: 'Extract and save embedded images from documents'
					},
					{
						displayName: 'Page Range',
						name: 'pageRange',
						type: 'string',
						default: '',
						placeholder: '1-5, 10, 15-20',
						description: 'Specific pages to process (leave empty for all pages)',
						displayOptions: {
							show: {
								'/ocrEngine': ['marker']
							}
						}
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
				displayName: 'Advanced Features',
				name: 'advancedFeatures',
				type: 'collection',
				placeholder: 'Add Feature',
				default: {},
				displayOptions: {
					show: {
						ocrEngine: ['tesseract', 'google-vision', 'azure-vision']
					}
				},
				options: [
					{
						displayName: 'Enhance Contrast',
						name: 'enhanceContrast',
						type: 'boolean',
						default: false,
						description: 'Apply contrast enhancement before OCR'
					},
					{
						displayName: 'Remove Noise',
						name: 'removeNoise',
						type: 'boolean',
						default: false,
						description: 'Apply noise reduction algorithms'
					},
					{
						displayName: 'Detect Orientation',
						name: 'detectOrientation',
						type: 'boolean',
						default: false,
						description: 'Automatically detect and correct text orientation'
					},
					{
						displayName: 'Extract Tables',
						name: 'extractTables',
						type: 'boolean',
						default: false,
						description: 'Specialized table extraction and formatting'
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
			{
				displayName: 'Return Format',
				name: 'returnFormat',
				type: 'options',
				options: [
					{
						name: 'Full OCR Results',
						value: 'full',
						description: 'Complete OCR data with metadata, confidence scores, and statistics'
					},
					{
						name: 'Text Only',
						value: 'text',
						description: 'Only the extracted text content'
					},
					{
						name: 'Text + Metadata',
						value: 'textWithMeta',
						description: 'Extracted text with basic metadata'
					}
				],
				default: 'full',
				description: 'What data to return in the output'
			}
		]
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				// Get node parameters
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const ocrEngine = this.getNodeParameter('ocrEngine', i) as string;
				const outputFormat = this.getNodeParameter('outputFormat', i) as string;
				const languages = this.getNodeParameter('languages', i) as string[];
				const processingOptions = this.getNodeParameter('processingOptions', i, {}) as any;
				const advancedFeatures = this.getNodeParameter('advancedFeatures', i, {}) as any;
				const processingTimeout = this.getNodeParameter('processingTimeout', i, 300) as number;
				const returnFormat = this.getNodeParameter('returnFormat', i) as string;

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
				const fileName = binaryData.fileName || `document_${i}.pdf`;
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
				const options: ProcessingOptions = {
					ocrEngine: ocrEngine as any,
					outputFormat: outputFormat as any,
					languages,
					enhanceLlm: processingOptions.enhanceLlm,
					llmProvider: processingOptions.llmProvider,
					geminiModel: processingOptions.geminiModel,
					extractImages: processingOptions.extractImages,
					pageRange: processingOptions.pageRange,
					confidenceThreshold: processingOptions.confidenceThreshold,
					preprocessing: {
						enhanceContrast: advancedFeatures.enhanceContrast,
						removeNoise: advancedFeatures.removeNoise,
						detectOrientation: advancedFeatures.detectOrientation,
					}
				};

				// Validate processing options
				const optionsValidation = validateProcessingOptions(options);
				if (!optionsValidation.isValid) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid processing options: ${optionsValidation.errors.join(', ')}`,
						{ itemIndex: i }
					);
				}

				// Get credentials
				let credentials: OCREngineCredentials;
				let cloudCredentials: any = {};

				if (ocrEngine === 'marker' || ocrEngine === 'gemini-direct') {
					credentials = await this.getCredentials('ocrEngineApi', i) as OCREngineCredentials;
				} else if (ocrEngine === 'google-vision') {
					cloudCredentials.googleCloudApi = await this.getCredentials('googleCloudApi', i);
					credentials = { baseUrl: 'direct' }; // Will use direct API calls
				} else if (ocrEngine === 'azure-vision') {
					cloudCredentials.azureComputerVision = await this.getCredentials('azureComputerVision', i);
					credentials = { baseUrl: 'direct' }; // Will use direct API calls
				} else {
					credentials = { baseUrl: 'local' }; // For Tesseract local processing
				}

				// Process the file
				let result: any;

				if (ocrEngine === 'marker' || ocrEngine === 'gemini-direct') {
					// Use OCR Engine API
					const apiClient = new OCREngineApiClient(credentials.baseUrl, this);
					
					// Submit job
					const { sessionId } = await apiClient.processFile(
						buffer,
						fileName,
						mimeType,
						options,
						credentials
					);

					// Wait for completion
					const status = await apiClient.waitForCompletion(
						sessionId,
						processingTimeout * 1000
					);

					if (status.status === 'failed') {
						throw new NodeOperationError(
							this.getNode(),
							`OCR processing failed: ${status.error || 'Unknown error'}`,
							{ itemIndex: i }
						);
					}

					// Download results based on return format
					const resultsData = status.results as any;
					if (returnFormat === 'full') {
						// Get the full results with metadata
						result = {
							sessionId,
							fileName,
							processingEngine: ocrEngine,
							outputFormat,
							status: status.status,
							results: status.results,
							extractedText: resultsData?.[outputFormat],
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
					} else if (returnFormat === 'text') {
						result = {
							text: resultsData?.[outputFormat] || '',
							fileName,
							ocrEngine
						};
					} else {
						result = {
							text: resultsData?.[outputFormat] || '',
							fileName,
							ocrEngine,
							metadata: {
								fileName,
								fileSize: buffer.length,
								mimeType,
								timestamp: new Date().toISOString()
							}
						};
					}

				} else {
					// For cloud OCR services or Tesseract, we would implement direct processing
					// For now, throw an error indicating these need the OCR Engine server
					throw new NodeOperationError(
						this.getNode(),
						`Direct ${ocrEngine} processing not implemented. Use the OCR Engine server with 'marker' or 'gemini-direct' options.`,
						{ itemIndex: i }
					);
				}

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
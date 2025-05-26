import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OcrEngineApi implements ICredentialType {
	name = 'ocrEngineApi';
	displayName = 'OCR Engine API';
	documentationUrl = 'http://localhost:8100';
	properties: INodeProperties[] = [
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8100',
			description: 'The base URL of your OCR Engine API server',
			required: true,
			placeholder: 'http://localhost:8100',
		},
		{
			displayName: 'Gemini API Key',
			name: 'geminiApiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Google Gemini API key for enhanced OCR processing (optional)',
			required: false,
		},
		{
			displayName: 'Ollama URL',
			name: 'ollamaUrl',
			type: 'string',
			default: 'http://localhost:11434',
			description: 'Ollama server URL for local LLM processing (optional)',
			required: false,
			placeholder: 'http://localhost:11434',
		},
		{
			displayName: 'Ollama Model',
			name: 'ollamaModel',
			type: 'string',
			default: 'gemma3:12b',
			description: 'Ollama model to use for local LLM processing (optional)',
			required: false,
			placeholder: 'gemma3:12b',
		},
	];
}
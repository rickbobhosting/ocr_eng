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
			description: 'Google Gemini API key for Gemini Direct OCR (required only for Gemini Direct OCR)',
			required: false,
		},
	];
}
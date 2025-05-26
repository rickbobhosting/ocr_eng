import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AzureComputerVision implements ICredentialType {
	name = 'azureComputerVision';
	displayName = 'Azure Computer Vision';
	documentationUrl = 'https://docs.microsoft.com/en-us/azure/cognitive-services/computer-vision/';
	properties: INodeProperties[] = [
		{
			displayName: 'Subscription Key',
			name: 'subscriptionKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The Azure Computer Vision subscription key',
			required: true,
		},
		{
			displayName: 'Endpoint',
			name: 'endpoint',
			type: 'string',
			default: 'https://your-resource.cognitiveservices.azure.com/',
			description: 'The Azure Computer Vision endpoint URL',
			required: true,
			placeholder: 'https://your-resource.cognitiveservices.azure.com/',
		},
	];
}
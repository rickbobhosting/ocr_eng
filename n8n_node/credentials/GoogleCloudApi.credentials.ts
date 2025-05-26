import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GoogleCloudApi implements ICredentialType {
	name = 'googleCloudApi';
	displayName = 'Google Cloud API';
	documentationUrl = 'https://cloud.google.com/vision/docs';
	properties: INodeProperties[] = [
		{
			displayName: 'Service Account Key',
			name: 'serviceAccountKey',
			type: 'json',
			typeOptions: {
				alwaysOpenEditWindow: true,
				rows: 10,
			},
			default: '',
			description: 'The Google Cloud service account JSON key for authentication',
			required: true,
		},
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			description: 'The Google Cloud project ID',
			required: true,
		},
	];
}
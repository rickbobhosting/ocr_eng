// OCR Engine Types
export interface OCREngineCredentials {
	baseUrl: string;
	geminiApiKey?: string;
}


export interface ProcessingOptions {
	ocrEngine: 'marker' | 'gemini-direct';
	outputFormat: 'markdown' | 'json' | 'html' | 'pdf';
	languages: string[];
	enhanceLlm?: boolean;
	llmProvider?: 'ollama' | 'gemini';
	geminiModel?: string;
	ollamaModel?: string;
	extractImages?: boolean;
	confidenceThreshold?: number;
}

export interface OCRResult {
	ocrResults: {
		text: string;
		confidence: number;
		language: string;
		pageCount: number;
		processingTime: number;
		words?: Array<{
			text: string;
			confidence: number;
			bbox: { x: number; y: number; width: number; height: number };
		}>;
		lines?: Array<{
			text: string;
			confidence: number;
			bbox: { x: number; y: number; width: number; height: number };
		}>;
		blocks?: Array<{
			text: string;
			confidence: number;
			bbox: { x: number; y: number; width: number; height: number };
		}>;
	};
	metadata: {
		fileName: string;
		fileSize: number;
		imageWidth?: number;
		imageHeight?: number;
		dpi?: number;
		ocrEngine: string;
		language: string;
		processingOptions: Record<string, any>;
		timestamp: string;
	};
	quality: {
		overallConfidence: number;
		lowConfidenceWords: number;
		estimatedAccuracy: 'low' | 'medium' | 'high';
	};
	statistics: {
		totalWords: number;
		totalLines: number;
		totalBlocks: number;
		averageWordConfidence: number;
	};
}

export interface SessionStatus {
	sessionId: string;
	status: 'processing' | 'completed' | 'failed' | 'pending';
	progress?: number;
	message?: string;
	results?: {
		markdown?: string;
		json?: string;
		html?: string;
		pdf?: string;
	};
	error?: string;
}

export interface FileValidation {
	isValid: boolean;
	mimeType?: string;
	fileSize?: number;
	errorMessage?: string;
	supportedFormats: string[];
}
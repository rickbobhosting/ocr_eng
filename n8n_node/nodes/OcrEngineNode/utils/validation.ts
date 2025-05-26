import { FileValidation } from './types';

// Supported file formats based on the OCR Engine documentation
const SUPPORTED_FORMATS = {
	markdown: ['pdf', 'docx', 'pptx', 'xlsx', 'epub', 'mobi', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp'],
	geminiDirect: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp'],
	tesseract: ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'pdf'],
	cloudOcr: ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'pdf']
};

const MIME_TYPE_MAP: Record<string, string> = {
	'application/pdf': 'pdf',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/tiff': 'tiff',
	'image/bmp': 'bmp',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/epub+zip': 'epub',
	'application/x-mobipocket-ebook': 'mobi'
};

const MAX_FILE_SIZES: Record<string, number> = {
	default: 100 * 1024 * 1024, // 100MB
	image: 50 * 1024 * 1024,    // 50MB for images
	pdf: 200 * 1024 * 1024      // 200MB for PDFs
};

export function validateFile(
	mimeType: string, 
	fileSize: number, 
	ocrEngine: string
): FileValidation {
	const fileExtension = MIME_TYPE_MAP[mimeType];
	
	if (!fileExtension) {
		return {
			isValid: false,
			mimeType,
			fileSize,
			errorMessage: `Unsupported file type: ${mimeType}`,
			supportedFormats: getSupportedFormats(ocrEngine)
		};
	}

	const supportedFormats = getSupportedFormats(ocrEngine);
	if (!supportedFormats.includes(fileExtension)) {
		return {
			isValid: false,
			mimeType,
			fileSize,
			errorMessage: `File format '${fileExtension}' not supported by ${ocrEngine} engine`,
			supportedFormats
		};
	}

	// Check file size limits
	const maxSize = getMaxFileSize(fileExtension);
	if (fileSize > maxSize) {
		return {
			isValid: false,
			mimeType,
			fileSize,
			errorMessage: `File size (${formatFileSize(fileSize)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`,
			supportedFormats
		};
	}

	return {
		isValid: true,
		mimeType,
		fileSize,
		supportedFormats
	};
}

function getSupportedFormats(ocrEngine: string): string[] {
	switch (ocrEngine) {
		case 'gemini-direct':
			return SUPPORTED_FORMATS.geminiDirect;
		case 'tesseract':
			return SUPPORTED_FORMATS.tesseract;
		case 'google-vision':
		case 'azure-vision':
			return SUPPORTED_FORMATS.cloudOcr;
		case 'marker':
		default:
			return SUPPORTED_FORMATS.markdown;
	}
}

function getMaxFileSize(fileExtension: string): number {
	if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp'].includes(fileExtension)) {
		return MAX_FILE_SIZES.image;
	}
	if (fileExtension === 'pdf') {
		return MAX_FILE_SIZES.pdf;
	}
	return MAX_FILE_SIZES.default;
}

function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function validateProcessingOptions(options: any): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Validate OCR engine
	const validEngines = ['marker', 'gemini-direct', 'tesseract', 'google-vision', 'azure-vision'];
	if (!validEngines.includes(options.ocrEngine)) {
		errors.push(`Invalid OCR engine: ${options.ocrEngine}. Must be one of: ${validEngines.join(', ')}`);
	}

	// Validate output format
	const validFormats = ['markdown', 'json', 'html', 'pdf'];
	if (!validFormats.includes(options.outputFormat)) {
		errors.push(`Invalid output format: ${options.outputFormat}. Must be one of: ${validFormats.join(', ')}`);
	}

	// Validate languages
	if (!Array.isArray(options.languages) || options.languages.length === 0) {
		errors.push('At least one language must be specified');
	}

	// Validate confidence threshold
	if (options.confidenceThreshold !== undefined) {
		if (typeof options.confidenceThreshold !== 'number' || 
			options.confidenceThreshold < 0 || 
			options.confidenceThreshold > 100) {
			errors.push('Confidence threshold must be a number between 0 and 100');
		}
	}

	// Validate LLM provider
	if (options.llmProvider && !['ollama', 'gemini'].includes(options.llmProvider)) {
		errors.push(`Invalid LLM provider: ${options.llmProvider}. Must be 'ollama' or 'gemini'`);
	}

	// Validate Gemini Direct specific requirements
	if (options.ocrEngine === 'gemini-direct' && options.llmProvider !== 'gemini') {
		errors.push('Gemini Direct OCR requires Gemini as the LLM provider');
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}
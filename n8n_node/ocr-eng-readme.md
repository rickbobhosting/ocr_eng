# n8n OCR Engine Node

A comprehensive n8n custom node for Optical Character Recognition (OCR) that integrates with advanced OCR Engine applications. Extract text from images and documents using GPU-accelerated processing, AI enhancement, and multiple OCR engines.

## Overview

This custom node enables n8n workflows to perform sophisticated document processing and text extraction from various file formats including PDFs, images, and Office documents. It connects to an external OCR Engine API server and provides multiple processing options with AI-powered enhancement capabilities.

## Features

### 🚀 Advanced OCR Engines
- **Marker OCR**: GPU-accelerated processing with layout detection and reading order analysis
- **Gemini Direct OCR**: Direct AI processing bypassing traditional pipeline (images only)

### 🧠 AI Enhancement
- **LLM Integration**: Enhance OCR accuracy with local Ollama or cloud Gemini models
- **Smart Provider Detection**: Automatic model provider detection from connected AI nodes
- **Multiple Model Support**: Compatible with various Gemini and Ollama models

### 📄 Comprehensive Format Support
- **Input Formats**: PDF, DOCX, PPTX, XLSX, EPUB, MOBI, JPG, PNG, WebP, TIFF, BMP
- **Output Formats**: Markdown, JSON, HTML, PDF

### 🎯 Advanced Processing Options
- **Multi-language Support**: 15+ languages including auto-detection
- **Image Enhancement**: Contrast enhancement, noise reduction, orientation detection
- **Confidence Thresholding**: Quality control with confidence scoring
- **Session Management**: Robust processing with timeout handling

## Installation

### Prerequisites
- n8n installed (self-hosted instance)
- OCR Engine server running
- Node.js 18+ and npm

### Install Steps

1. **Build the node**:
```bash
npm install
npm run build
```

2. **Install in n8n**:
```bash
# Copy to n8n custom nodes directory
cp -r dist/* ~/.n8n/custom/
```

3. **Restart n8n** to load the new node

## Configuration

### OCR Engine API Credentials

Create credentials for the OCR Engine API:
- **Name**: OCR Engine API
- **API Base URL**: `http://localhost:8100` (your OCR Engine server URL)
- **Gemini API Key**: Google Gemini API key (optional, for Gemini Direct OCR)

### Optional Cloud OCR Credentials

- **Google Cloud API**: For Google Cloud Vision OCR
- **Azure Computer Vision**: For Microsoft OCR services

## Usage

### Basic Configuration

1. **Add OCR Engine node** to your workflow
2. **Connect binary data** from previous nodes
3. **Set Binary Property**: Usually `data`
4. **Choose OCR Engine**: Marker OCR or Gemini Direct
5. **Select Output Format**: Markdown, JSON, HTML, or PDF
6. **Configure Languages**: Select target languages or auto-detect

### Advanced Options

#### LLM Enhancement
- **Enable LLM**: Improve OCR accuracy with AI models
- **Provider Selection**: Auto-detect, force Ollama, or force Gemini
- **Model Override**: Specify exact model name if needed

#### Processing Options
- **Extract Images**: Save embedded images from documents
- **Confidence Threshold**: Set minimum confidence level
- **Processing Timeout**: Configure maximum processing time

## OCR Engine Selection

### Marker OCR (Recommended for Documents)
- **Best for**: PDF files, complex layouts, multi-column text
- **Features**: GPU acceleration, table detection, equation handling
- **Performance**: Fastest for complex documents

### Gemini Direct OCR (Recommended for Images)  
- **Best for**: Image files, immediate results
- **Features**: Direct AI processing, requires LLM enhancement
- **Performance**: Fast cloud processing, no GPU required

## Output Examples

### Markdown Output
```markdown
# Document Title

Content extracted from the document with proper formatting preserved.

## Section Headers
- Bullet points maintained
- **Bold text** preserved
- *Italic text* preserved
```

### JSON Output
```json
{
  "title": "Document Title",
  "content": "Extracted content...",
  "metadata": {
    "pages": 3,
    "confidence": 95.2
  }
}
```

## File Structure

```
/
├── credentials/                          # Credential definitions
│   ├── OcrEngineApi.credentials.ts      # Main OCR Engine API
│   ├── GoogleCloudApi.credentials.ts    # Google Cloud Vision
│   └── AzureComputerVision.credentials.ts # Azure Computer Vision
├── nodes/
│   └── OcrEngineNode/
│       ├── OcrEngineNode.node.ts        # Main node implementation
│       ├── icon.svg                     # Node icon
│       └── utils/
│           ├── apiClient.ts             # Primary API client
│           ├── simpleApiClient.ts       # Alternative HTTP client
│           ├── types.ts                 # TypeScript interfaces
│           └── validation.ts            # Input validation
├── package.json                         # Package configuration
├── tsconfig.json                       # TypeScript config
├── gulpfile.js                         # Build configuration
└── index.ts                            # Module exports
```

## API Integration

The node communicates with the OCR Engine API server using:

1. **File Upload**: Multipart form data with processing options
2. **Session Management**: Polling for completion status  
3. **Result Download**: Retrieving processed content
4. **Error Handling**: Comprehensive validation and recovery

## Development

### Building
```bash
npm run build        # Compile TypeScript
npm run typecheck    # Type checking
npm run lint         # Code linting
npm run format       # Code formatting
```

### Packaging
```bash
npm pack            # Create installable package
```

### Testing
The node includes robust error handling and fallback mechanisms for reliable operation in production workflows.

## Troubleshooting

### Common Issues

1. **No binary data found**: Check binary property name matches input
2. **OCR processing failed**: Verify OCR Engine server is running
3. **Connection timeout**: Check network connectivity and server status
4. **Model not found**: Ensure AI model is properly connected or specify model override

### Performance Tips

- Use Marker OCR for high-volume document processing
- Enable LLM enhancement for improved accuracy on complex documents
- Set appropriate timeout values for large files
- Monitor OCR Engine server resources for optimal performance

## Docker Integration

For Docker deployments, ensure the custom node directory is properly mounted and the container has access to:
- OCR Engine API server
- AI model services (Ollama/Gemini)
- Required network connectivity

## License

MIT License - See LICENSE file for details

## Support

For issues and questions related to this n8n node implementation, check the logs and error messages for detailed debugging information.
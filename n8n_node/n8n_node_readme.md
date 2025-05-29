# OCR Engine n8n Node

A comprehensive n8n custom node for Optical Character Recognition (OCR) that integrates with the OCR Engine application. This node enables n8n workflows to extract text from images and documents using GPU-accelerated processing, AI enhancement, and multiple OCR engines.

## Features

### 🚀 Advanced OCR Engines
- **Marker OCR**: GPU-accelerated processing with layout detection and reading order analysis
- **Gemini Direct OCR**: Direct AI processing bypassing traditional pipeline (images only)
- **Tesseract**: Local OCR processing
- **Google Cloud Vision**: Cloud-based OCR with Google's advanced AI
- **Azure Computer Vision**: Microsoft's cognitive services for OCR

### 🧠 AI Enhancement
- **LLM Integration**: Enhance OCR accuracy with local Ollama or cloud Gemini models
- **Multiple Gemini Models**: Support for latest Gemini 2.5 Flash, Pro, and other variants
- **Smart Processing**: Automatic provider switching based on OCR engine selection

### 📄 Comprehensive Format Support
- **Documents**: PDF, DOCX, PPTX, XLSX, EPUB, MOBI
- **Images**: JPG, PNG, WebP, TIFF, BMP
- **Output Formats**: Markdown, JSON, HTML, PDF

## Installation

### Prerequisites
- n8n installed (self-hosted instance)
- OCR Engine server running (see main project README)
- Node.js 18+ and npm

### Install the Node Package

1. **Unpack the custom node**:
```bash
cd /path/to/ocr_eng/n8n_node
tar -xzf n8n-ocr-engine-custom.tar.gz
npm install
npm run build
```

2. **Link the package globally**:
```bash
npm link
```

3. **Link to your n8n installation**:
```bash
# Navigate to your n8n custom directory
cd ~/.n8n/custom
npm link n8n-nodes-ocr-engine
```

4. **Restart n8n** to load the new node:
```bash
# If running as service
sudo systemctl restart n8n

# If running manually
# Stop n8n and restart with: n8n start
```

### Verify Installation

1. Open your n8n interface
2. Create a new workflow
3. Search for "OCR Engine" in the node panel
4. The node should appear under the "Transform" category

## Configuration

### Set Up OCR Engine API Credentials

Create credentials for the OCR Engine API:

- **Name**: OCR Engine API
- **API Base URL**: `http://YOUR_HOST_IP:8100` (your OCR Engine server URL)
- **Gemini API Key**: Your Google Gemini API key (optional, for AI enhancement)
- **Ollama URL**: `http://localhost:11434` (optional, for local LLM)
- **Ollama Model**: `gemma3:12b` (optional, your preferred model)

### Cloud OCR Credentials (Optional)

#### Google Cloud Vision
- **Service Account Key**: JSON key file content
- **Project ID**: Your Google Cloud project ID

#### Azure Computer Vision
- **Subscription Key**: Your Azure cognitive services key
- **Endpoint**: Your Azure endpoint URL

## Usage

### Basic OCR Processing

1. **Add the OCR Engine node** to your workflow
2. **Connect binary data** (from HTTP Request, File Trigger, etc.)
3. **Configure the node**:
   - **Binary Property**: `data` (or your binary property name)
   - **OCR Engine**: Choose your preferred engine
   - **Output Format**: Select desired output format
   - **Languages**: Select target languages

### Example Workflow

```
HTTP Request (PDF file) 
    ↓
OCR Engine Node 
    ↓
Switch Node (based on confidence)
    ↓
Response/Database Save
```

## OCR Engine Selection Guide

### 📄 **Marker OCR** (Recommended for Documents)
- **Best for**: PDF files, complex layouts, multi-column text
- **Features**: GPU acceleration, table detection, equation handling
- **Supported formats**: All formats including Office documents
- **Performance**: Fastest for complex documents

### ⚡ **Gemini Direct OCR** (Recommended for Images)
- **Best for**: Image files, immediate results
- **Features**: Direct AI processing, zero hallucination
- **Supported formats**: Image files only (JPG, PNG, WebP, TIFF, BMP)
- **Performance**: Fast cloud processing, no GPU required

### 🔧 **Tesseract** (Local Processing)
- **Best for**: Simple images, offline processing
- **Features**: Local processing, traditional OCR
- **Supported formats**: Images and simple PDFs
- **Performance**: Moderate, fully local

### ☁️ **Cloud OCR** (Google/Azure)
- **Best for**: High accuracy, API-based processing
- **Features**: Advanced AI models, reliable recognition
- **Supported formats**: Images and PDFs
- **Performance**: Excellent accuracy, API limits apply

## Troubleshooting

### Connection Issues
1. **Check OCR Engine server**: Ensure it's running on the configured URL
2. **Verify credentials**: Test API keys and connection settings
3. **Check network**: Ensure n8n can reach the OCR Engine server
4. **Review logs**: Check both n8n and OCR Engine logs

### Processing Issues
1. **File format compatibility**: Verify the file type is supported by the chosen engine
2. **File size limits**: Check file size against the configured limits
3. **Language support**: Ensure the selected languages are supported
4. **Timeout settings**: Increase timeout for large documents

### Performance Optimization
- Use **Marker OCR** for maximum throughput
- Enable **GPU acceleration** on the OCR Engine server
- Set appropriate **processing timeouts**
- Use **batch processing** when possible

## Development

If you need to modify or extend the node, the project structure is organized as follows:

```
n8n_node/
├── package.json                           # Package configuration
├── tsconfig.json                          # TypeScript configuration
├── gulpfile.js                           # Build configuration
├── index.ts                              # Main exports
├── nodes/
│   └── OcrEngineNode/
│       ├── OcrEngineNode.node.ts         # Main node implementation
│       ├── icon.svg                      # Node icon
│       └── utils/
│           ├── types.ts                  # TypeScript types
│           ├── validation.ts             # Input validation
│           └── apiClient.ts              # API client
├── credentials/
│   ├── OcrEngineApi.credentials.ts       # OCR Engine API credentials
│   ├── GoogleCloudApi.credentials.ts     # Google Cloud credentials
│   └── AzureComputerVision.credentials.ts # Azure credentials
└── dist/                                 # Compiled output
```

### Building from Source
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run type checking
npm run typecheck

# Format code
npm run format

# Lint code
npm run lint
```

## Support

For issues and questions:

1. **OCR Engine Issues**: Check the main OCR Engine project documentation
2. **n8n Integration**: Review the n8n custom nodes documentation
3. **Node-Specific Issues**: Check the logs and error messages for debugging

## License

This project is licensed under the MIT License.
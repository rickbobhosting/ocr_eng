"""
Marker OCR Web Frontend
A comprehensive web interface for document processing with Marker OCR.
"""
import os
import sys
import logging
import asyncio
import uuid
import json
import shutil
import base64
import io
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime

# FastAPI imports
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse as StarletteJSONResponse
import uvicorn

# Import Marker OCR wrapper
from marker_wrapper import MarkerOCR

# Import Gemini for direct OCR
try:
    import google.generativeai as genai
    from PIL import Image
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Create app
app = FastAPI(
    title="Marker OCR Web Interface",
    description="Advanced document processing with Marker OCR, LLM enhancement, and GPU acceleration",
    version="2.0.0"
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/web_frontend.log")
    ]
)
logger = logging.getLogger("marker_web")

# Ensure directories exist
os.makedirs("logs", exist_ok=True)
os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Initialize Marker OCR
ocr_engine = MarkerOCR()

# In-memory storage for processing sessions
processing_sessions: Dict[str, Dict[str, Any]] = {}


# Add validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error on {request.url}: {exc.errors()}")
    return StarletteJSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "body": exc.body,
            "message": "Validation failed"
        }
    )


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Main page with upload interface."""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "title": "Marker OCR Web Interface"
    })


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "marker_available": True,
        "gemini_available": GEMINI_AVAILABLE,
        "gpu_available": os.environ.get("CUDA_VISIBLE_DEVICES", "0") != ""
    }


async def process_with_gemini_direct(
    file_path: str,
    gemini_api_key: str,
    gemini_model: str,
    output_format: str = "markdown"
) -> Dict[str, Any]:
    """
    Process a file directly with Gemini Vision API for OCR.
    
    Args:
        file_path: Path to the image file
        gemini_api_key: Gemini API key
        gemini_model: Gemini model name
        output_format: Output format (markdown, json, html)
        
    Returns:
        Dictionary with processing results
    """
    try:
        if not GEMINI_AVAILABLE:
            raise Exception("Google Generative AI library not available")
        
        # Configure Gemini
        genai.configure(api_key=gemini_api_key)
        
        # Load and process the image
        start_time = datetime.now()
        
        # Open image with PIL
        image = Image.open(file_path)
        
        # Create the model
        model = genai.GenerativeModel(gemini_model)
        
        # Create OCR prompt based on output format
        if output_format == "json":
            prompt = """Perform precise OCR on this image. Extract ALL visible text exactly as it appears, maintaining structural integrity and spatial relationships.

Return a clean JSON object:
{
    "text": "complete extracted text",
    "blocks": [
        {
            "type": "heading|paragraph|table|list|caption",
            "content": "exact text content",
            "level": 1
        }
    ]
}

CRITICAL REQUIREMENTS:
- Extract ONLY the text that is actually visible in the image
- Maintain exact structural layout and hierarchy
- Preserve all formatting, spacing, and line breaks
- Do NOT add explanations, interpretations, or additional content
- Do NOT modify or improve the original text
- Capture text exactly as written, including any errors or unconventional formatting"""
        elif output_format == "html":
            prompt = """Perform precise OCR on this image. Extract ALL visible text exactly as it appears, maintaining structural integrity.

Format as clean HTML using appropriate semantic tags:
- <h1>, <h2>, <h3> for headings (match hierarchy)
- <p> for paragraphs
- <table><tr><td> for tabular data
- <ul><li> or <ol><li> for lists
- <strong>, <em> for emphasis (only if clearly formatted)

CRITICAL REQUIREMENTS:
- Extract ONLY the text visible in the image
- Preserve exact spatial relationships and document structure
- Return only HTML content (no DOCTYPE, html, or body tags)
- Do NOT add explanations, interpretations, or additional content
- Maintain original text exactly as written"""
        else:  # markdown (default)
            prompt = """Perform precise OCR on this image. Extract ALL visible text exactly as it appears, maintaining structural integrity and spatial relationships.

Format as clean Markdown:
- # ## ### for headings (match original hierarchy)
- **text** for bold (only if clearly bold in image)
- *text* for italic (only if clearly italic in image)
- | table | format | for tables
- - or * for bullet points
- 1. 2. 3. for numbered lists
- Preserve original line breaks and paragraph spacing

CRITICAL REQUIREMENTS:
- Extract ONLY the text that is actually visible in the image
- Maintain exact structural layout and hierarchy
- Do NOT add explanations, interpretations, or additional content beyond the visible text
- Do NOT modify, correct, or improve the original text
- Preserve all formatting exactly as it appears in the source document
- Return ONLY the extracted text in Markdown format - nothing else
            """
        
        # Generate content
        response = model.generate_content([prompt, image])
        
        if not response.text:
            raise Exception("No text extracted from image")
        
        # Calculate processing time
        end_time = datetime.now()
        processing_time = str(end_time - start_time)
        
        # Return results in Marker-compatible format
        return {
            "success": True,
            "text": response.text,
            "text_length": len(response.text),
            "processing_time": processing_time,
            "pages_processed": 1,
            "method": "gemini_direct",
            "model": gemini_model,
            "metadata": {
                "input_file": file_path,
                "method": "Gemini Direct OCR",
                "model": gemini_model,
                "processing_time": processing_time,
                "text_length": len(response.text)
            }
        }
        
    except Exception as e:
        logger.error(f"Gemini direct OCR failed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "method": "gemini_direct"
        }


@app.post("/api/test-upload")
async def test_upload(
    files: List[UploadFile] = File(...),
    test_param: str = Form(default="test")
):
    """Simple test upload endpoint for debugging."""
    try:
        logger.info(f"Test upload received {len(files)} files")
        logger.info(f"Test param: {test_param}")
        
        file_info = []
        for file in files:
            info = {
                "filename": file.filename,
                "content_type": file.content_type,
                "size": file.size
            }
            file_info.append(info)
            logger.info(f"File: {info}")
        
        return {
            "success": True,
            "files_count": len(files),
            "files": file_info,
            "test_param": test_param
        }
    except Exception as e:
        logger.error(f"Test upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/gemini-direct")
async def gemini_direct_ocr(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    output_format: Optional[str] = Form(default="markdown"),
    gemini_api_key: str = Form(...),
    gemini_model: Optional[str] = Form(default="gemini-2.5-flash-preview-05-20")
):
    """
    Process files directly with Gemini Vision API (bypassing Marker OCR).
    
    Args:
        files: List of image files to process
        output_format: Output format (markdown, json, html)
        gemini_api_key: Google Gemini API key (required)
        gemini_model: Gemini model name
    """
    try:
        if not GEMINI_AVAILABLE:
            raise HTTPException(status_code=503, detail="Gemini direct OCR not available. Google Generative AI library not installed.")
        
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key is required for direct OCR")
        
        logger.info(f"Gemini direct OCR request received with {len(files)} files")
        logger.info(f"Parameters: format={output_format}, model={gemini_model}")
        
        # Validate file types (only images supported for direct Gemini OCR)
        supported_types = {'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp'}
        for file in files:
            if file.content_type not in supported_types:
                raise HTTPException(
                    status_code=400, 
                    detail=f"File {file.filename} has unsupported type {file.content_type}. Only images are supported for Gemini direct OCR."
                )
        
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        # Create organized session directory structure
        session_dir = Path("outputs") / f"project_{session_id}"
        session_dir.mkdir(exist_ok=True)
        
        # Create organized subdirectories
        documents_dir = session_dir / "documents"
        images_dir = session_dir / "images"
        metadata_dir = session_dir / "metadata"
        documents_dir.mkdir(exist_ok=True)
        images_dir.mkdir(exist_ok=True)
        metadata_dir.mkdir(exist_ok=True)
        
        # Initialize session data
        processing_sessions[session_id] = {
            "status": "processing",
            "total_files": len(files),
            "processed_files": 0,
            "files": [],
            "started_at": datetime.now().isoformat(),
            "method": "gemini_direct",
            "settings": {
                "output_format": output_format,
                "method": "gemini_direct",
                "gemini_model": gemini_model,
                "gemini_api_key": "***"
            }
        }
        
        # Save uploaded files first, then process in background
        saved_files = []
        for file in files:
            # Save file immediately while the file handle is still open
            input_file = images_dir / file.filename  # Save to images directory
            with open(input_file, "wb") as f:
                content = await file.read()
                f.write(content)
            saved_files.append({
                "filename": file.filename,
                "filepath": str(input_file),
                "content_type": file.content_type,
                "size": len(content)
            })
            logger.info(f"Saved file: {file.filename} ({len(content)} bytes)")
        
        # Process saved files in background with Gemini direct
        background_tasks.add_task(
            process_gemini_direct_background,
            session_id,
            saved_files,
            session_dir,
            documents_dir,
            metadata_dir,
            output_format,
            gemini_api_key,
            gemini_model
        )
        
        logger.info(f"Started Gemini direct processing session {session_id} with {len(files)} files")
        
        return JSONResponse(content={
            "success": True,
            "session_id": session_id,
            "method": "gemini_direct",
            "message": f"Processing {len(files)} file(s) with Gemini Direct OCR (session {session_id})",
            "settings": processing_sessions[session_id]["settings"]
        })
    
    except Exception as e:
        logger.error(f"Error starting Gemini direct processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    output_format: Optional[str] = Form(default="markdown"),
    use_llm: Optional[bool] = Form(default=False),
    extract_images: Optional[bool] = Form(default=True),
    max_pages: Optional[str] = Form(default=""),
    llm_provider: Optional[str] = Form(default="ollama"),
    processing_method: Optional[str] = Form(default="marker"),
    ollama_url: Optional[str] = Form(default="http://host.docker.internal:11434"),
    ollama_model: Optional[str] = Form(default="gemma3:12b"),
    gemini_api_key: Optional[str] = Form(default=""),
    gemini_model: Optional[str] = Form(default="gemini-1.5-flash")
):
    """
    Upload and process files with Marker OCR.
    
    Args:
        files: List of files to process
        output_format: Output format (markdown, json, html)
        use_llm: Whether to use LLM enhancement
        extract_images: Whether to extract images
        max_pages: Maximum pages to process
        llm_provider: LLM provider (ollama, gemini)
        ollama_url: Ollama service URL
        ollama_model: Ollama model name
        gemini_api_key: Google Gemini API key
        gemini_model: Gemini model name
    """
    try:
        logger.info(f"Upload request received with {len(files)} files")
        logger.info(f"Parameters: format={output_format}, llm={use_llm}, provider={llm_provider}, extract_images={extract_images}, max_pages='{max_pages}'")
        
        # Convert max_pages string to int, handling empty values
        max_pages_int = None
        if max_pages and max_pages.strip():
            try:
                max_pages_int = int(max_pages.strip())
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid max_pages value: '{max_pages}'. Must be a number.")
        
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        # Create organized session directory structure
        session_dir = Path("outputs") / f"project_{session_id}"
        session_dir.mkdir(exist_ok=True)
        
        # Create organized subdirectories
        documents_dir = session_dir / "documents"
        images_dir = session_dir / "images" 
        metadata_dir = session_dir / "metadata"
        documents_dir.mkdir(exist_ok=True)
        images_dir.mkdir(exist_ok=True)
        metadata_dir.mkdir(exist_ok=True)
        
        # Initialize session data
        processing_sessions[session_id] = {
            "status": "processing",
            "total_files": len(files),
            "processed_files": 0,
            "files": [],
            "started_at": datetime.now().isoformat(),
            "settings": {
                "output_format": output_format,
                "use_llm": use_llm,
                "llm_provider": llm_provider,
                "extract_images": extract_images,
                "max_pages": max_pages_int,
                "ollama_url": ollama_url,
                "ollama_model": ollama_model,
                "gemini_api_key": "***" if gemini_api_key else "",
                "gemini_model": gemini_model
            }
        }
        
        # Save uploaded files first, then process in background
        saved_files = []
        for file in files:
            # Save file immediately while the file handle is still open
            input_file = documents_dir / file.filename
            with open(input_file, "wb") as f:
                content = await file.read()
                f.write(content)
            saved_files.append({
                "filename": file.filename,
                "filepath": str(input_file),
                "content_type": file.content_type,
                "size": len(content)
            })
            logger.info(f"Saved file: {file.filename} ({len(content)} bytes)")
        
        # Process saved files in background
        background_tasks.add_task(
            process_files_background,
            session_id,
            saved_files,
            session_dir,
            documents_dir,
            images_dir,
            metadata_dir,
            output_format,
            use_llm,
            llm_provider,
            extract_images,
            max_pages_int,
            ollama_url,
            ollama_model,
            gemini_api_key,
            gemini_model
        )
        
        logger.info(f"Started processing session {session_id} with {len(files)} files")
        
        return JSONResponse(content={
            "success": True,
            "session_id": session_id,
            "message": f"Processing {len(files)} file(s) with session {session_id}",
            "settings": processing_sessions[session_id]["settings"]
        })
    
    except Exception as e:
        logger.error(f"Error starting file processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_files_background(
    session_id: str,
    saved_files: List[Dict[str, str]],
    session_dir: Path,
    documents_dir: Path,
    images_dir: Path,
    metadata_dir: Path,
    output_format: str,
    use_llm: bool,
    llm_provider: str,
    extract_images: bool,
    max_pages: Optional[int],
    ollama_url: str,
    ollama_model: str,
    gemini_api_key: str,
    gemini_model: str
):
    """Background task to process uploaded files."""
    try:
        processed_files = []
        
        for i, file_info in enumerate(saved_files):
            try:
                filename = file_info["filename"]
                filepath = file_info["filepath"]
                
                logger.info(f"Processing file {i+1}/{len(saved_files)}: {filename}")
                
                # Configure processing options with organized output paths
                processing_options = {
                    "pdf_path": filepath,
                    "output_dir": str(documents_dir),  # Output to documents directory
                    "output_format": output_format,  # Only generate this format
                    "extract_images": extract_images,
                    "max_pages": max_pages,
                    "images_dir": str(images_dir),  # Extract images to images directory
                    "organized_output": True  # Enable organized output structure
                }
                
                # Add LLM options if enabled
                if use_llm:
                    processing_options["use_llm"] = True
                    
                    if llm_provider == "gemini":
                        processing_options.update({
                            "llm_service": "marker.services.gemini.GoogleGeminiService",
                            "gemini_api_key": gemini_api_key,
                            "gemini_model": gemini_model
                        })
                    else:  # Default to Ollama
                        processing_options.update({
                            "llm_service": "marker.services.ollama.OllamaService",
                            "ollama_base_url": ollama_url,
                            "ollama_model": ollama_model
                        })
                
                # Process with Marker OCR
                result = ocr_engine.convert_pdf(**processing_options)
                
                if result['success']:
                    file_result = {
                        "filename": filename,
                        "status": "completed",
                        "processing_time": result.get('processing_time', 'N/A'),
                        "pages_processed": result.get('pages_processed', 'N/A'),
                        "output_files": {
                            "markdown": result.get('markdown_file'),
                            "json": result.get('json_file'),
                            "html": result.get('html_file') if not (result.get('html_file', '').endswith('_temp.html')) else None,
                            "pdf": result.get('pdf_file')
                        },
                        "images_extracted": len(result.get('images', [])),
                        "metadata": result.get('metadata', {})
                    }
                    processed_files.append(file_result)
                    
                    # Update session progress
                    processing_sessions[session_id]["processed_files"] = i + 1
                    processing_sessions[session_id]["files"] = processed_files
                    
                    logger.info(f"Successfully processed {filename}")
                else:
                    error_info = {
                        "filename": filename,
                        "status": "failed",
                        "error": result.get('error', 'Unknown error')
                    }
                    processed_files.append(error_info)
                    logger.error(f"Failed to process {filename}: {result.get('error')}")
            
            except Exception as e:
                error_info = {
                    "filename": filename,
                    "status": "failed",
                    "error": str(e)
                }
                processed_files.append(error_info)
                logger.error(f"Error processing {filename}: {str(e)}")
        
        # Update session status
        processing_sessions[session_id].update({
            "status": "completed",
            "completed_at": datetime.now().isoformat(),
            "files": processed_files
        })
        
        logger.info(f"Completed processing session {session_id}")
    
    except Exception as e:
        processing_sessions[session_id].update({
            "status": "failed",
            "error": str(e),
            "failed_at": datetime.now().isoformat()
        })
        logger.error(f"Background processing failed for session {session_id}: {str(e)}")


async def process_gemini_direct_background(
    session_id: str,
    saved_files: List[Dict[str, str]],
    session_dir: Path,
    documents_dir: Path,
    metadata_dir: Path,
    output_format: str,
    gemini_api_key: str,
    gemini_model: str
):
    """Background task to process files with Gemini Direct OCR."""
    try:
        processed_files = []
        
        for i, file_info in enumerate(saved_files):
            try:
                filename = file_info["filename"]
                filepath = file_info["filepath"]
                
                logger.info(f"Processing file {i+1}/{len(saved_files)} with Gemini Direct: {filename}")
                
                # Update file status to processing
                processing_sessions[session_id]["files"] = processed_files + [{
                    "filename": filename,
                    "status": "processing"
                }]
                
                # Process with Gemini Direct OCR
                result = await process_with_gemini_direct(
                    filepath,
                    gemini_api_key,
                    gemini_model,
                    output_format
                )
                
                if result['success']:
                    # Create output file in documents directory
                    output_filename = f"{Path(filename).stem}.{output_format}"
                    output_file = documents_dir / output_filename
                    
                    # Write the extracted text to file
                    with open(output_file, 'w', encoding='utf-8') as f:
                        f.write(result['text'])
                    
                    # Create metadata file
                    metadata_file = metadata_dir / f"{Path(filename).stem}_metadata.json"
                    with open(metadata_file, 'w', encoding='utf-8') as f:
                        json.dump(result['metadata'], f, indent=2)
                    
                    file_result = {
                        "filename": filename,
                        "status": "completed",
                        "processing_time": result.get('processing_time', 'N/A'),
                        "pages_processed": result.get('pages_processed', 1),
                        "method": "gemini_direct",
                        "model": result.get('model', gemini_model),
                        "output_files": {
                            output_format: str(output_file),
                            "metadata": str(metadata_file)
                        },
                        "text_length": result.get('text_length', 0),
                        "metadata": result.get('metadata', {})
                    }
                    processed_files.append(file_result)
                    
                    # Update session progress
                    processing_sessions[session_id]["processed_files"] = i + 1
                    processing_sessions[session_id]["files"] = processed_files
                    
                    logger.info(f"Successfully processed {filename} with Gemini Direct OCR")
                else:
                    error_info = {
                        "filename": filename,
                        "status": "failed",
                        "method": "gemini_direct",
                        "error": result.get('error', 'Unknown error')
                    }
                    processed_files.append(error_info)
                    logger.error(f"Failed to process {filename} with Gemini Direct: {result.get('error')}")
            
            except Exception as e:
                error_info = {
                    "filename": filename,
                    "status": "failed",
                    "method": "gemini_direct",
                    "error": str(e)
                }
                processed_files.append(error_info)
                logger.error(f"Error processing {filename} with Gemini Direct: {str(e)}")
        
        # Update session status
        processing_sessions[session_id].update({
            "status": "completed",
            "completed_at": datetime.now().isoformat(),
            "files": processed_files
        })
        
        logger.info(f"Completed Gemini Direct processing session {session_id}")
    
    except Exception as e:
        processing_sessions[session_id].update({
            "status": "failed",
            "error": str(e),
            "failed_at": datetime.now().isoformat()
        })
        logger.error(f"Gemini Direct background processing failed for session {session_id}: {str(e)}")


@app.get("/api/sessions/{session_id}/status")
async def get_session_status(session_id: str):
    """Get processing status for a session."""
    if session_id not in processing_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return JSONResponse(content=processing_sessions[session_id])


@app.get("/api/sessions/{session_id}/download/{filename}")
async def download_file(session_id: str, filename: str):
    """Download a processed file."""
    try:
        project_dir = Path("outputs") / f"project_{session_id}"
        
        # Search for the file in project directory and subdirectories
        file_path = None
        
        # First try direct path
        direct_path = project_dir / filename
        if direct_path.exists() and direct_path.is_file():
            file_path = direct_path
        else:
            # Search recursively in subdirectories (documents, images, metadata)
            for path in project_dir.rglob(filename):
                if path.is_file():
                    file_path = path
                    break
        
        logger.info(f"Download request for '{filename}' in session {session_id}")
        logger.info(f"Project directory: {project_dir}")
        logger.info(f"Found file: {file_path}")
        
        if not file_path or not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type='application/octet-stream'
        )
    
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}/download-all")
async def download_all_files(session_id: str):
    """Download all processed files as a ZIP archive."""
    import zipfile
    import tempfile
    
    try:
        project_dir = Path("outputs") / f"project_{session_id}"
        
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Create a temporary ZIP file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_zip:
            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add all files from the project directory
                for file_path in project_dir.rglob('*'):
                    if file_path.is_file():
                        # Create archive path relative to project directory
                        archive_path = file_path.relative_to(project_dir)
                        zipf.write(file_path, archive_path)
            
            # Return the ZIP file
            return FileResponse(
                path=temp_zip.name,
                filename=f"ocr-results-{session_id}.zip",
                media_type='application/zip',
                background=None  # Let the file be cleaned up by the OS
            )
    
    except Exception as e:
        logger.error(f"Error creating bulk download: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """Clean up session files and data."""
    try:
        project_dir = Path("outputs") / f"project_{session_id}"
        
        if project_dir.exists():
            import shutil
            shutil.rmtree(project_dir)
        
        if session_id in processing_sessions:
            del processing_sessions[session_id]
        
        logger.info(f"Cleaned up session {session_id}")
        return {"message": f"Session {session_id} cleaned up successfully"}
    
    except Exception as e:
        logger.error(f"Error cleaning up session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions")
async def list_sessions():
    """List all active sessions."""
    return JSONResponse(content={
        "sessions": list(processing_sessions.keys()),
        "total": len(processing_sessions)
    })


@app.get("/api/formats")
async def get_supported_formats():
    """Get information about supported formats and features."""
    return {
        "input_formats": {
            "pdf": "PDF documents (recommended)",
            "images": ["JPEG", "PNG", "WebP", "TIFF", "BMP"],
            "office": ["DOCX", "PPTX", "XLSX"],
            "ebooks": ["EPUB", "MOBI"],
            "web": ["HTML"]
        },
        "output_formats": {
            "markdown": "Clean markdown with preserved structure",
            "json": "Structured JSON with metadata",
            "html": "HTML with styling and formatting"
        },
        "llm_features": {
            "layout_enhancement": "Improved layout detection",
            "table_processing": "Better table recognition",
            "equation_processing": "Enhanced mathematical content",
            "image_descriptions": "AI-generated image descriptions"
        },
        "gpu_support": os.environ.get("CUDA_VISIBLE_DEVICES", "0") != ""
    }


def cleanup_old_outputs():
    """Clean up old output files and directories."""
    try:
        outputs_dir = Path("outputs")
        if not outputs_dir.exists():
            return
        
        # Remove all project directories
        for item in outputs_dir.iterdir():
            if item.is_dir() and (item.name.startswith("session_") or item.name.startswith("project_")):
                logger.info(f"Cleaning up project directory: {item.name}")
                shutil.rmtree(item)
            elif item.is_file():
                logger.info(f"Cleaning up file: {item.name}")
                item.unlink()
        
        # Clear in-memory sessions
        processing_sessions.clear()
        
        logger.info("✅ Output cleanup completed")
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {str(e)}")


@app.post("/api/cleanup")
async def manual_cleanup():
    """Manually trigger cleanup of output files."""
    try:
        cleanup_old_outputs()
        return {"success": True, "message": "Output files cleaned up successfully"}
    except Exception as e:
        logger.error(f"Manual cleanup failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Clean up old outputs on startup
    logger.info("🧹 Performing startup cleanup...")
    cleanup_old_outputs()
    
    # Run the web application
    uvicorn.run(
        "web_frontend:app",
        host="0.0.0.0",
        port=8100,
        reload=False,
        log_level="info"
    )
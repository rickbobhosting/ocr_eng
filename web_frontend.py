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
        "gpu_available": os.environ.get("CUDA_VISIBLE_DEVICES", "0") != ""
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


@app.post("/api/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    output_format: Optional[str] = Form(default="markdown"),
    use_llm: Optional[bool] = Form(default=False),
    extract_images: Optional[bool] = Form(default=True),
    max_pages: Optional[str] = Form(default=""),
    llm_provider: Optional[str] = Form(default="ollama"),
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
        
        # Create session directory
        session_dir = Path("outputs") / f"session_{session_id}"
        session_dir.mkdir(exist_ok=True)
        
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
            input_file = session_dir / file.filename
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
                
                # Configure processing options - only generate selected format
                processing_options = {
                    "pdf_path": filepath,
                    "output_dir": str(session_dir),
                    "output_format": output_format,  # Only generate this format
                    "extract_images": extract_images,
                    "max_pages": max_pages
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
                            "html": result.get('html_file')
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
        session_dir = Path("outputs") / f"session_{session_id}"
        
        # Search for the file in session directory and subdirectories
        file_path = None
        
        # First try direct path
        direct_path = session_dir / filename
        if direct_path.exists() and direct_path.is_file():
            file_path = direct_path
        else:
            # Search recursively in subdirectories
            for path in session_dir.rglob(filename):
                if path.is_file():
                    file_path = path
                    break
        
        logger.info(f"Download request for '{filename}' in session {session_id}")
        logger.info(f"Session directory: {session_dir}")
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


@app.delete("/api/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """Clean up session files and data."""
    try:
        session_dir = Path("outputs") / f"session_{session_id}"
        
        if session_dir.exists():
            import shutil
            shutil.rmtree(session_dir)
        
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
        
        # Remove all session directories
        for item in outputs_dir.iterdir():
            if item.is_dir() and item.name.startswith("session_"):
                logger.info(f"Cleaning up session directory: {item.name}")
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
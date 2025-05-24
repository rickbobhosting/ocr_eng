"""
Marker OCR Server - A FastAPI server focused on Marker OCR processing.
Provides high-quality document conversion using the Marker OCR engine.
"""
import os
import sys
import logging
import asyncio
from typing import Dict, Any, Optional, List
from pathlib import Path
import uuid
from datetime import datetime

# FastAPI imports
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Response, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

# Import Marker OCR wrapper
from marker_wrapper import MarkerOCR

# Create app
app = FastAPI(
    title="Marker OCR Server",
    description="High-quality document conversion server using Marker OCR",
    version="2.0.0"
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/marker_ocr_server.log")
    ]
)
logger = logging.getLogger("marker_ocr_server")

# Ensure directories exist
os.makedirs("logs", exist_ok=True)
os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Marker OCR
ocr_engine = MarkerOCR()


@app.get("/")
async def root():
    """Root endpoint with server information."""
    return {
        "message": "Marker OCR Server",
        "version": "2.0.0",
        "description": "High-quality document conversion using Marker OCR",
        "supported_formats": [
            "PDF", "JPEG", "PNG", "WebP", "TIFF", "BMP",
            "DOCX", "PPTX", "XLSX", "EPUB", "MOBI", "HTML"
        ],
        "output_formats": ["markdown", "json", "html"],
        "status": "ready"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "marker_available": True
    }


@app.post("/convert")
async def convert_document(
    file: UploadFile = File(...),
    output_format: str = Form(default="markdown"),
    extract_images: bool = Form(default=True),
    max_pages: Optional[int] = Form(default=None),
    language: str = Form(default="en")
):
    """
    Convert uploaded document using Marker OCR.
    
    Args:
        file: Document file to convert
        output_format: Output format (markdown, json, html, or both)
        extract_images: Whether to extract images
        max_pages: Maximum pages to process (None for all)
        language: Document language code
    
    Returns:
        JSON response with conversion results
    """
    try:
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        # Create session directory
        session_dir = Path("outputs") / f"session_{session_id}"
        session_dir.mkdir(exist_ok=True)
        
        # Save uploaded file
        input_file = session_dir / file.filename
        with open(input_file, "wb") as f:
            content = await file.read()
            f.write(content)
        
        logger.info(f"Processing {file.filename} with Marker OCR (Session: {session_id})")
        
        # Process with Marker OCR
        result = ocr_engine.convert_pdf(
            pdf_path=str(input_file),
            output_dir=str(session_dir),
            output_format=output_format,
            extract_images=extract_images,
            max_pages=max_pages,
            language=language
        )
        
        if result['success']:
            response_data = {
                "success": True,
                "session_id": session_id,
                "filename": file.filename,
                "output_format": output_format,
                "processing_time": result.get('processing_time', 'N/A'),
                "pages_processed": result.get('pages_processed', 'N/A'),
                "markdown_file": result.get('markdown_file'),
                "json_file": result.get('json_file'),
                "html_file": result.get('html_file'),
                "images_extracted": len(result.get('images', [])),
                "metadata": result.get('metadata', {})
            }
            
            # Add text content if available
            if 'text' in result:
                response_data['text'] = result['text']
            
            logger.info(f"Successfully processed {file.filename}")
            return JSONResponse(content=response_data)
        else:
            logger.error(f"Failed to process {file.filename}: {result.get('error')}")
            raise HTTPException(
                status_code=500,
                detail=f"Conversion failed: {result.get('error', 'Unknown error')}"
            )
    
    except Exception as e:
        logger.error(f"Error processing {file.filename}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing error: {str(e)}"
        )


@app.get("/download/{session_id}/{filename}")
async def download_file(session_id: str, filename: str):
    """Download processed file from session."""
    try:
        file_path = Path("outputs") / f"session_{session_id}" / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type='application/octet-stream'
        )
    
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get information about a processing session."""
    try:
        session_dir = Path("outputs") / f"session_{session_id}"
        
        if not session_dir.exists():
            raise HTTPException(status_code=404, detail="Session not found")
        
        files = list(session_dir.iterdir())
        file_info = []
        
        for file_path in files:
            if file_path.is_file():
                file_info.append({
                    "name": file_path.name,
                    "size": file_path.stat().st_size,
                    "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                })
        
        return {
            "session_id": session_id,
            "files": file_info,
            "total_files": len(file_info)
        }
    
    except Exception as e:
        logger.error(f"Error getting session info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """Clean up session files."""
    try:
        session_dir = Path("outputs") / f"session_{session_id}"
        
        if session_dir.exists():
            import shutil
            shutil.rmtree(session_dir)
            logger.info(f"Cleaned up session {session_id}")
            return {"message": f"Session {session_id} cleaned up successfully"}
        else:
            raise HTTPException(status_code=404, detail="Session not found")
    
    except Exception as e:
        logger.error(f"Error cleaning up session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/formats")
async def get_supported_formats():
    """Get information about supported input and output formats."""
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
            "html": "HTML with styling and formatting",
            "both": "Multiple formats simultaneously"
        },
        "features": [
            "Table detection and conversion",
            "Mathematical equation preservation",
            "Image extraction",
            "Multi-language support (90+ languages)",
            "Batch processing",
            "Custom page ranges"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    
    # Run server
    uvicorn.run(
        "marker_ocr_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
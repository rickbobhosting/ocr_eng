#!/usr/bin/env python3
"""
Enhanced Marker OCR Wrapper for OCR Project
==========================================

This wrapper provides an easy-to-use interface for Marker OCR that integrates
seamlessly with the existing OCR project infrastructure.

Features:
- Lazy model loading for efficiency
- Error handling and graceful fallbacks
- Support for both single files and batch processing
- Integration with existing project structure
- CLI and programmatic interfaces
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
import tempfile
import shutil

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marker_wrapper")

# Check if Marker is available
try:
    import marker
    import subprocess
    # Test CLI availability
    result = subprocess.run(['marker_single', '--help'], 
                          capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        MARKER_AVAILABLE = True
        logger.info("✓ Marker OCR is available (CLI)")
    else:
        MARKER_AVAILABLE = False
        logger.warning("⚠️ Marker CLI not responding")
except Exception as e:
    MARKER_AVAILABLE = False
    logger.warning(f"⚠️ Marker OCR not available: {e}")
    logger.warning("Please run: pip install marker-pdf[full]")


class MarkerOCR:
    """
    Enhanced Marker OCR wrapper with lazy loading and error handling.
    """
    
    def __init__(self, lazy_load: bool = True, use_gpu: bool = True):
        """
        Initialize MarkerOCR wrapper.
        
        Args:
            lazy_load: If True, models are loaded only when first needed
            use_gpu: Whether to use GPU acceleration if available
        """
        self.models = None
        self.models_loaded = False
        self.use_gpu = use_gpu
        self.logger = logging.getLogger("marker_ocr")
        
        # Check availability on each instance creation to be safe
        self.available = self._check_marker_availability()
        
        # Configure GPU settings
        self._setup_gpu_environment()
        
        if not lazy_load and self.available:
            self._load_models()
    
    def _check_marker_availability(self) -> bool:
        """Check if Marker is available for this instance."""
        try:
            import marker
            import subprocess
            # Test CLI availability
            result = subprocess.run(['marker_single', '--help'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                self.logger.info("✓ Marker OCR is available (CLI)")
                return True
            else:
                self.logger.warning("⚠️ Marker CLI not responding")
                return False
        except Exception as e:
            self.logger.warning(f"⚠️ Marker OCR not available: {e}")
            self.logger.warning("Please run: pip install marker-pdf[full]")
            return False
    
    def _setup_gpu_environment(self):
        """Configure GPU environment for optimal performance."""
        if self.use_gpu:
            try:
                import torch
                if torch.cuda.is_available():
                    # Set optimal CUDA settings
                    os.environ['CUDA_LAUNCH_BLOCKING'] = '0'
                    os.environ['TORCH_USE_CUDA_DSA'] = '1'
                    
                    # Enable optimized attention if available
                    if hasattr(torch.backends.cuda, 'enable_flash_sdp'):
                        torch.backends.cuda.enable_flash_sdp(True)
                    
                    self.logger.info(f"✓ GPU acceleration enabled - {torch.cuda.get_device_name(0)}")
                else:
                    # Don't log anything - this is normal for Docker/WSL
                    self.use_gpu = False
            except ImportError:
                self.logger.warning("⚠️ PyTorch not available, falling back to CPU")
                self.use_gpu = False
        else:
            # Force CPU mode
            os.environ['CUDA_VISIBLE_DEVICES'] = ''
            self.logger.info("ℹ️ Using CPU mode")
    
    def _convert_with_cli(self, input_path: str, output_dir: str, 
                         output_format: str = "markdown", 
                         extract_images: bool = True,
                         max_pages: Optional[int] = None,
                         use_llm: bool = False,
                         llm_service: str = None,
                         ollama_base_url: str = None,
                         ollama_model: str = None,
                         gemini_api_key: str = None,
                         gemini_model: str = None,
                         images_dir: str = None,
                         organized_output: bool = False) -> Dict[str, Any]:
        """Convert file using Marker CLI."""
        import subprocess
        import json
        from pathlib import Path
        
        try:
            # Build CLI command
            cmd = ['marker_single', input_path, '--output_dir', output_dir]
            
            # Add output format
            if output_format == "json":
                cmd.extend(['--output_format', 'json'])
            elif output_format == "html":
                cmd.extend(['--output_format', 'html'])
            elif output_format == "pdf":
                # Generate markdown first, then convert to PDF
                cmd.extend(['--output_format', 'markdown'])
            else:  # default to markdown
                cmd.extend(['--output_format', 'markdown'])
            
            # Add image extraction setting
            if not extract_images:
                cmd.append('--disable_image_extraction')
            
            # Add page range if specified
            if max_pages:
                cmd.extend(['--page_range', f'0-{max_pages-1}'])
            
            # Add LLM support if enabled
            if use_llm:
                cmd.append('--use_llm')
                if llm_service:
                    cmd.extend(['--llm_service', llm_service])
                if ollama_base_url:
                    cmd.extend(['--OllamaService_ollama_base_url', ollama_base_url])
                if ollama_model:
                    cmd.extend(['--OllamaService_ollama_model', ollama_model])
                # Add Gemini support
                if gemini_api_key:
                    cmd.extend(['--GoogleGeminiService_gemini_api_key', gemini_api_key])
                if gemini_model:
                    cmd.extend(['--GoogleGeminiService_gemini_model_name', gemini_model])
            
            logger.info(f"Running: {' '.join(cmd)}")
            
            # Run the command
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0:
                error_msg = result.stderr or "Unknown CLI error"
                logger.error(f"CLI failed: {error_msg}")
                return {
                    "success": False,
                    "error": f"Marker CLI failed: {error_msg}"
                }
            
            # Find output files
            output_path = Path(output_dir)
            input_name = Path(input_path).stem
            
            # Look for generated files
            markdown_file = None
            json_file = None
            html_file = None
            text_content = ""
            
            # Find the output files (Marker may create subdirectories)
            # Look for files in the session directory first, then subdirectories
            for file_path in output_path.iterdir():
                if file_path.is_file():
                    if file_path.suffix == '.md' and not markdown_file:
                        markdown_file = str(file_path)
                        with open(file_path, 'r', encoding='utf-8') as f:
                            text_content = f.read()
                        logger.info(f"Found markdown file: {file_path.name}")
                    elif file_path.suffix == '.json' and not json_file:
                        json_file = str(file_path)
                        if not text_content:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                json_data = json.load(f)
                                text_content = json_data.get('text', '')
                        logger.info(f"Found JSON file: {file_path.name}")
                    elif file_path.suffix == '.html' and not html_file:
                        html_file = str(file_path)
                        logger.info(f"Found HTML file: {file_path.name}")
            
            # If we didn't find files at the top level, search subdirectories
            if not markdown_file and not json_file and not html_file:
                for file_path in output_path.rglob("*"):
                    if file_path.is_file():
                        if file_path.suffix == '.md' and not markdown_file:
                            markdown_file = str(file_path)
                            with open(file_path, 'r', encoding='utf-8') as f:
                                text_content = f.read()
                            logger.info(f"Found markdown file in subdir: {file_path.name}")
                        elif file_path.suffix == '.json' and not json_file:
                            json_file = str(file_path)
                            if not text_content:
                                with open(file_path, 'r', encoding='utf-8') as f:
                                    json_data = json.load(f)
                                    text_content = json_data.get('text', '')
                            logger.info(f"Found JSON file in subdir: {file_path.name}")
                        elif file_path.suffix == '.html' and not html_file:
                            html_file = str(file_path)
                            logger.info(f"Found HTML file in subdir: {file_path.name}")
            
            # Find extracted images
            images = []
            for img_path in output_path.rglob("*.png"):
                images.append(str(img_path))
            for img_path in output_path.rglob("*.jpg"):
                images.append(str(img_path))
            
            # Generate PDF based on output format or when files are available
            pdf_file = None
            input_name = Path(input_path).stem
            
            # Always try to generate PDF if we have source files
            if html_file:
                # Use existing HTML file
                pdf_file = self._generate_pdf_from_html(html_file, output_dir, input_name)
            elif markdown_file:
                # Convert markdown to HTML then to PDF
                temp_html = self._markdown_to_html(markdown_file, output_dir, input_name)
                if temp_html:
                    pdf_file = self._generate_pdf_from_html(temp_html, output_dir, input_name)
            
            return {
                "success": True,
                "text": text_content,
                "markdown_file": markdown_file,
                "json_file": json_file,
                "html_file": html_file,
                "pdf_file": pdf_file,
                "images": images,
                "metadata": {
                    "input_file": input_path,
                    "output_dir": output_dir,
                    "pages_processed": "CLI",
                    "images_extracted": len(images)
                }
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Conversion timed out (5 minutes)"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"CLI conversion failed: {str(e)}"
            }

    def _generate_pdf_from_html(self, html_file: str, output_dir: str, base_name: str) -> Optional[str]:
        """Generate PDF from HTML file using weasyprint."""
        try:
            from weasyprint import HTML, CSS
            from pathlib import Path
            
            html_path = Path(html_file)
            if not html_path.exists():
                logger.error(f"HTML file not found: {html_file}")
                return None
            
            # Output PDF path
            pdf_path = Path(output_dir) / f"{base_name}.pdf"
            
            # Create simple CSS for better PDF formatting
            css_style = CSS(string='''
                @page {
                    margin: 1in;
                    size: letter;
                }
                body {
                    font-family: "Times New Roman", serif;
                    font-size: 12pt;
                    line-height: 1.5;
                    color: #000;
                }
                h1, h2, h3, h4, h5, h6 {
                    color: #333;
                    margin-top: 1em;
                    margin-bottom: 0.5em;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1em 0;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f5f5f5;
                }
                img {
                    max-width: 100%;
                    height: auto;
                }
                code {
                    background-color: #f5f5f5;
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: monospace;
                }
                pre {
                    background-color: #f5f5f5;
                    padding: 1em;
                    border-radius: 5px;
                    overflow-x: auto;
                }
            ''')
            
            # Generate PDF
            HTML(filename=str(html_path)).write_pdf(
                str(pdf_path),
                stylesheets=[css_style]
            )
            
            logger.info(f"✅ PDF generated successfully: {pdf_path.name}")
            return str(pdf_path)
            
        except ImportError:
            logger.warning("⚠️ weasyprint not available - cannot generate PDF")
            return None
        except Exception as e:
            logger.error(f"❌ PDF generation failed: {str(e)}")
            return None

    def _markdown_to_html(self, markdown_file: str, output_dir: str, base_name: str) -> Optional[str]:
        """Convert markdown to HTML for PDF generation."""
        try:
            try:
                import markdown
            except ImportError:
                logger.warning("⚠️ markdown library not available - installing...")
                import subprocess
                subprocess.check_call(['pip', 'install', 'markdown'])
                import markdown
            
            from pathlib import Path
            
            md_path = Path(markdown_file)
            if not md_path.exists():
                logger.error(f"Markdown file not found: {markdown_file}")
                return None
            
            # Read markdown content
            with open(md_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
            
            # Convert to HTML
            md = markdown.Markdown(extensions=['tables', 'codehilite', 'toc'])
            html_content = md.convert(md_content)
            
            # Create full HTML document
            full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{base_name}</title>
    <style>
        body {{
            font-family: "Times New Roman", serif;
            font-size: 12pt;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 1em;
            color: #333;
        }}
        h1, h2, h3, h4, h5, h6 {{
            color: #222;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }}
        th {{
            background-color: #f5f5f5;
            font-weight: bold;
        }}
        code {{
            background-color: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }}
        pre {{
            background-color: #f5f5f5;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }}
        pre code {{
            background: none;
            padding: 0;
        }}
        blockquote {{
            border-left: 4px solid #ddd;
            margin: 1em 0;
            padding-left: 1em;
            color: #666;
        }}
        img {{
            max-width: 100%;
            height: auto;
            margin: 1em 0;
        }}
    </style>
</head>
<body>
{html_content}
</body>
</html>"""
            
            # Save HTML file
            html_path = Path(output_dir) / f"{base_name}_temp.html"
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(full_html)
            
            logger.info(f"✅ Markdown converted to HTML: {html_path.name}")
            return str(html_path)
            
        except ImportError:
            logger.warning("⚠️ markdown library not available - cannot convert MD to HTML")
            return None
        except Exception as e:
            logger.error(f"❌ Markdown to HTML conversion failed: {str(e)}")
            return None

    def _load_models(self):
        """Load Marker models with error handling (CLI-based approach)."""
        if self.models_loaded:
            return True
            
        if not self.available:
            logger.error("Marker is not available. Cannot load models.")
            return False
        
        # For CLI approach, we just test that marker_single works
        try:
            import subprocess
            result = subprocess.run(['marker_single', '--help'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                self.models_loaded = True
                logger.info("✅ Marker CLI is ready")
                return True
            else:
                logger.error("❌ Marker CLI not responding correctly")
                return False
        except Exception as e:
            logger.error(f"❌ Failed to test Marker CLI: {e}")
            self.models = None
            self.models_loaded = False
            return False
    
    def is_ready(self) -> bool:
        """Check if Marker is ready for use."""
        return self.available and (self.models_loaded or self._load_models())
    
    def convert_pdf(self, 
                   pdf_path: Union[str, Path], 
                   output_dir: Optional[Union[str, Path]] = None,
                   output_format: str = "markdown",
                   extract_images: bool = True,
                   max_pages: Optional[int] = None,
                   **kwargs) -> Dict[str, Any]:
        """
        Convert a document file using Marker OCR.
        
        Supports multiple file formats:
        - PDF files (.pdf) - Primary format with best support
        - Image files: JPEG, PNG, WebP, TIFF, BMP
        - Microsoft Office: DOCX, PPTX, XLSX  
        - E-books: EPUB, MOBI
        - Web: HTML files
        
        Args:
            pdf_path: Path to the document file (any supported format)
            output_dir: Directory to save output (default: same as input file)
            output_format: Output format ("markdown", "json", "html")
            extract_images: Whether to extract and save images
            max_pages: Maximum number of pages to process (None for all)
            **kwargs: Additional arguments (for LLM support)
            
        Returns:
            Dictionary with conversion results and metadata
        """
        # Validation
        if not self.available:
            return {
                "success": False,
                "error": "Marker OCR is not installed. Please run: pip install marker-pdf[full]"
            }
        
        if not self.is_ready():
            return {
                "success": False,
                "error": "Failed to load Marker models"
            }
        
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            return {
                "success": False,
                "error": f"PDF file not found: {pdf_path}"
            }
        
        # Check if file is supported format
        supported_extensions = {
            # PDF
            '.pdf',
            # Images  
            '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp',
            # Microsoft Office
            '.docx', '.pptx', '.xlsx',
            # E-books
            '.epub', '.mobi',
            # Web
            '.html', '.htm'
        }
        if pdf_path.suffix.lower() not in supported_extensions:
            return {
                "success": False,
                "error": f"Unsupported file format: {pdf_path}. Supported formats: PDF, images (JPG/PNG/WebP/TIFF/BMP), Office (DOCX/PPTX/XLSX), E-books (EPUB/MOBI), HTML"
            }
        
        # Setup output directory
        if output_dir is None:
            output_dir = pdf_path.parent / "marker_output"
        else:
            output_dir = Path(output_dir)
        
        output_dir.mkdir(exist_ok=True)
        
        try:
            logger.info(f"🔄 Converting file: {pdf_path.name}")
            
            # Use CLI to convert the file
            result = self._convert_with_cli(
                str(pdf_path),
                str(output_dir),
                output_format=output_format,
                extract_images=extract_images,
                max_pages=max_pages,
                use_llm=kwargs.get('use_llm', False),
                llm_service=kwargs.get('llm_service'),
                ollama_base_url=kwargs.get('ollama_base_url'),
                ollama_model=kwargs.get('ollama_model'),
                gemini_api_key=kwargs.get('gemini_api_key'),
                gemini_model=kwargs.get('gemini_model'),
                images_dir=kwargs.get('images_dir'),
                organized_output=kwargs.get('organized_output', False)
            )
            
            if not result["success"]:
                return result
            
            full_text = result["text"]
            images = result.get("images", [])
            metadata = result.get("metadata", {})
            
            results = {
                "success": True,
                "pdf_file": str(pdf_path),
                "output_dir": str(output_dir),
                "text_length": len(full_text),
                "num_images": len(images) if images else 0,
                "metadata": metadata
            }
            
            # Use the files that Marker CLI already created - don't create duplicates
            if result.get("markdown_file"):
                results["markdown_file"] = result["markdown_file"]
            if result.get("json_file"):
                results["json_file"] = result["json_file"]
            if result.get("html_file"):
                results["html_file"] = result["html_file"]
            if result.get("pdf_file"):
                results["pdf_file"] = result["pdf_file"]
            
            # Handle extracted images (CLI returns file paths, not PIL objects)
            if extract_images and images:
                results["images"] = images
                if images:
                    logger.info(f"🖼️ Images found: {len(images)} images")
            
            # Add text content for immediate access
            results["text"] = full_text
            
            logger.info(f"✅ Conversion completed: {pdf_path.name}")
            return results
            
        except Exception as e:
            error_msg = f"PDF conversion failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "pdf_file": str(pdf_path)
            }
    
    def convert_multiple(self, 
                        pdf_paths: List[Union[str, Path]], 
                        output_dir: Optional[Union[str, Path]] = None,
                        **kwargs) -> List[Dict[str, Any]]:
        """
        Convert multiple PDF files.
        
        Args:
            pdf_paths: List of PDF file paths
            output_dir: Base output directory
            **kwargs: Additional arguments passed to convert_pdf
            
        Returns:
            List of conversion results
        """
        results = []
        
        for pdf_path in pdf_paths:
            logger.info(f"🔄 Processing {Path(pdf_path).name} ({len(results)+1}/{len(pdf_paths)})")
            
            # Create individual output directory for each PDF
            if output_dir:
                pdf_output_dir = Path(output_dir) / Path(pdf_path).stem
            else:
                pdf_output_dir = None
            
            result = self.convert_pdf(pdf_path, pdf_output_dir, **kwargs)
            results.append(result)
            
            if result["success"]:
                logger.info(f"✅ Completed: {Path(pdf_path).name}")
            else:
                logger.error(f"❌ Failed: {Path(pdf_path).name} - {result.get('error', 'Unknown error')}")
        
        # Summary
        successful = sum(1 for r in results if r["success"])
        logger.info(f"📊 Batch conversion complete: {successful}/{len(results)} successful")
        
        return results
    
    def get_info(self) -> Dict[str, Any]:
        """Get information about the Marker installation."""
        info = {
            "marker_available": self.available,
            "models_loaded": self.models_loaded,
        }
        
        if self.available:
            import marker
            info["marker_version"] = getattr(marker, "__version__", "unknown")
            info["marker_location"] = marker.__file__
        
        return info


def create_sample_pdf():
    """Create a sample PDF for testing."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph
        from reportlab.lib.styles import getSampleStyleSheet
        
        sample_path = Path("sample_test.pdf")
        doc = SimpleDocTemplate(str(sample_path), pagesize=letter)
        styles = getSampleStyleSheet()
        
        content = [
            Paragraph("Sample PDF for Marker OCR Testing", styles['Title']),
            Paragraph("This is a test document created to verify Marker OCR functionality.", styles['Normal']),
            Paragraph("It contains simple text that should be easily extracted by Marker.", styles['Normal']),
        ]
        
        doc.build(content)
        return sample_path
        
    except ImportError:
        logger.warning("ReportLab not available - cannot create sample PDF")
        return None


def main():
    """Main function for command-line usage."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Marker OCR Wrapper")
    parser.add_argument("pdf_file", nargs="?", help="PDF file to convert")
    parser.add_argument("-o", "--output", help="Output directory")
    parser.add_argument("--format", choices=["markdown", "json", "both"], 
                       default="markdown", help="Output format")
    parser.add_argument("--no-images", action="store_true", 
                       help="Don't extract images")
    parser.add_argument("--max-pages", type=int, 
                       help="Maximum pages to process")
    parser.add_argument("--info", action="store_true", 
                       help="Show Marker installation info")
    parser.add_argument("--test", action="store_true", 
                       help="Run a test conversion")
    
    args = parser.parse_args()
    
    # Initialize Marker
    ocr = MarkerOCR(lazy_load=True)
    
    # Show info
    if args.info:
        info = ocr.get_info()
        print("\n=== Marker OCR Information ===")
        for key, value in info.items():
            print(f"{key}: {value}")
        return
    
    # Run test
    if args.test:
        print("\n=== Running Marker OCR Test ===")
        sample_pdf = create_sample_pdf()
        if sample_pdf:
            print(f"📄 Created test PDF: {sample_pdf}")
            result = ocr.convert_pdf(sample_pdf, output_format="both")
            
            if result["success"]:
                print(f"✅ Test successful!")
                print(f"📄 Markdown: {result.get('markdown_file', 'N/A')}")
                print(f"📄 JSON: {result.get('json_file', 'N/A')}")
                print(f"📊 Text length: {result['text_length']} characters")
                
                # Cleanup
                sample_pdf.unlink(missing_ok=True)
                output_dir = Path(result["output_dir"])
                if output_dir.exists():
                    shutil.rmtree(output_dir)
                print("🧹 Cleaned up test files")
            else:
                print(f"❌ Test failed: {result.get('error')}")
        else:
            print("❌ Could not create test PDF")
        return
    
    # Convert PDF
    if not args.pdf_file:
        parser.print_help()
        return
    
    if not Path(args.pdf_file).exists():
        print(f"❌ Error: PDF file not found: {args.pdf_file}")
        return
    
    print(f"\n=== Converting PDF with Marker OCR ===")
    print(f"📄 Input: {args.pdf_file}")
    print(f"📁 Output: {args.output or 'auto'}")
    print(f"📝 Format: {args.format}")
    
    result = ocr.convert_pdf(
        args.pdf_file,
        args.output,
        output_format=args.format,
        extract_images=not args.no_images,
        max_pages=args.max_pages
    )
    
    if result["success"]:
        print(f"\n✅ Conversion successful!")
        print(f"📊 Text extracted: {result['text_length']} characters")
        
        if "markdown_file" in result:
            print(f"📄 Markdown: {result['markdown_file']}")
        if "json_file" in result:
            print(f"📄 JSON: {result['json_file']}")
        if "images" in result:
            print(f"🖼️ Images: {len(result['images'])} extracted")
            
    else:
        print(f"\n❌ Conversion failed: {result.get('error')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
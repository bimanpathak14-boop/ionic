# Pocket AI Office — OCR / Screen Understanding
"""Screen understanding using basic OCR capabilities"""

import os

class OCRHandler:
    def __init__(self):
        pass

    def extract_text_from_image(self, path='', **kwargs):
        """Extract text from an image using PIL-based approach.
        For production, integrate Tesseract OCR or cloud OCR APIs."""
        if not os.path.exists(path):
            raise FileNotFoundError(f'Image not found: {path}')

        try:
            # Try pytesseract if available
            import pytesseract
            from PIL import Image

            # Standard Windows path for Tesseract
            tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            if os.path.exists(tesseract_path):
                pytesseract.pytesseract.tesseract_cmd = tesseract_path

            img = Image.open(path)
            text = pytesseract.image_to_string(img)
            return {
                'data': {
                    'text': text.strip(),
                    'source': path,
                    'engine': 'tesseract',
                }
            }
        except ImportError:
            return {
                'data': {
                    'text': '',
                    'source': path,
                    'engine': 'none',
                    'note': 'Install pytesseract for OCR support',
                }
            }

    def analyze_screen(self, **kwargs):
        """Capture and analyze current screen content"""
        try:
            import pyscreenshot as ImageGrab
            img = ImageGrab.grab()
            temp_path = os.path.expanduser('~/Documents/PocketAI/temp_screen.png')
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)
            img.save(temp_path)
            return self.extract_text_from_image(path=temp_path)
        except Exception as e:
            return {'data': {'error': f'Screen analysis failed: {str(e)}'}}

"""Image Generation & Editing Handler"""

import os
import base64
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance


class ImageHandler:
    def __init__(self):
        self.output_dir = os.path.expanduser('~/Documents/PocketAI/Images')
        os.makedirs(self.output_dir, exist_ok=True)

    def generate(self, prompt='', width=1024, height=1024, style='default', **kwargs):
        """Generate an image (placeholder — creates styled gradient with text).
        In production, connect to Stable Diffusion / DALL-E API."""
        img = Image.new('RGB', (width, height))
        draw = ImageDraw.Draw(img)

        colors = {
            'default': [(26, 26, 46), (102, 126, 234)],
            'warm': [(46, 26, 26), (234, 126, 102)],
            'cool': [(26, 36, 46), (102, 180, 234)],
            'nature': [(26, 46, 26), (102, 234, 126)],
        }
        c1, c2 = colors.get(style, colors['default'])

        # Gradient background
        for y in range(height):
            r = int(c1[0] + (c2[0] - c1[0]) * y / height)
            g = int(c1[1] + (c2[1] - c1[1]) * y / height)
            b = int(c1[2] + (c2[2] - c1[2]) * y / height)
            draw.line([(0, y), (width, y)], fill=(r, g, b))

        # Add text overlay
        try:
            font = ImageFont.truetype("arial.ttf", 32)
        except OSError:
            font = ImageFont.load_default()

        text = prompt[:60] if prompt else 'AI Generated Image'
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (width - tw) // 2
        y = (height - th) // 2

        # Text shadow
        draw.text((x + 2, y + 2), text, fill=(0, 0, 0, 128), font=font)
        draw.text((x, y), text, fill=(255, 255, 255), font=font)

        filename = f'ai_image_{len(os.listdir(self.output_dir)) + 1}.png'
        filepath = os.path.join(self.output_dir, filename)
        img.save(filepath, 'PNG', quality=95)

        return {
            'data': {'message': f'Image generated: {filename}', 'path': filepath, 'prompt': prompt},
            'filesCreated': [{'name': filename, 'path': filepath, 'type': 'image',
                              'mimeType': 'image/png', 'size': os.path.getsize(filepath)}],
        }

    def edit(self, path='', operations=None, **kwargs):
        """Edit an existing image with operations"""
        if not os.path.exists(path):
            raise FileNotFoundError(f'Image not found: {path}')

        img = Image.open(path)

        if operations:
            for op in operations:
                op_type = op.get('type')
                if op_type == 'blur':
                    radius = op.get('radius', 5)
                    img = img.filter(ImageFilter.GaussianBlur(radius))
                elif op_type == 'sharpen':
                    img = img.filter(ImageFilter.SHARPEN)
                elif op_type == 'brightness':
                    factor = op.get('factor', 1.2)
                    img = ImageEnhance.Brightness(img).enhance(factor)
                elif op_type == 'contrast':
                    factor = op.get('factor', 1.3)
                    img = ImageEnhance.Contrast(img).enhance(factor)
                elif op_type == 'grayscale':
                    img = img.convert('L').convert('RGB')
                elif op_type == 'rotate':
                    angle = op.get('angle', 90)
                    img = img.rotate(angle, expand=True)
                elif op_type == 'crop':
                    box = (op.get('left', 0), op.get('top', 0),
                           op.get('right', img.width), op.get('bottom', img.height))
                    img = img.crop(box)
                elif op_type == 'flip_horizontal':
                    img = img.transpose(Image.FLIP_LEFT_RIGHT)
                elif op_type == 'flip_vertical':
                    img = img.transpose(Image.FLIP_TOP_BOTTOM)

        output = op.get('output', path) if operations else path
        img.save(output)
        return {
            'data': {'message': f'Image edited: {output}', 'path': output},
            'filesCreated': [{'name': os.path.basename(output), 'path': output, 'type': 'image',
                              'size': os.path.getsize(output)}],
        }

    def resize(self, path='', width=800, height=600, maintain_aspect=True, **kwargs):
        """Resize an image"""
        if not os.path.exists(path):
            raise FileNotFoundError(f'Image not found: {path}')

        img = Image.open(path)
        if maintain_aspect:
            img.thumbnail((width, height), Image.LANCZOS)
        else:
            img = img.resize((width, height), Image.LANCZOS)

        output = kwargs.get('output', path)
        img.save(output)
        return {'data': {'message': f'Image resized to {img.size}', 'path': output}}

    def convert(self, path='', format='png', **kwargs):
        """Convert image format"""
        if not os.path.exists(path):
            raise FileNotFoundError(f'Image not found: {path}')

        img = Image.open(path)
        base = os.path.splitext(path)[0]
        output = f'{base}.{format}'
        img.save(output, format.upper())
        return {
            'data': {'message': f'Converted to {format}', 'path': output},
            'filesCreated': [{'name': os.path.basename(output), 'path': output, 'type': 'image',
                              'size': os.path.getsize(output)}],
        }

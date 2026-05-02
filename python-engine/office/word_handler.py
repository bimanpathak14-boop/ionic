"""Word Document Handler — Create & edit .docx files"""

import os
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from datetime import datetime


class WordHandler:
    def __init__(self):
        self.output_dir = os.path.expanduser('~/Documents/PocketAI')
        os.makedirs(self.output_dir, exist_ok=True)

    def create(self, title='Untitled', content='', template='blank',
               sections=None, author='Pocket AI Office', **kwargs):
        """Create a new Word document"""
        doc = Document()

        # Set document properties
        doc.core_properties.author = author
        doc.core_properties.title = title

        # Apply template styling
        self._apply_template(doc, template)

        # Add title
        title_para = doc.add_heading(title, level=0)
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Add date
        date_para = doc.add_paragraph(datetime.now().strftime('%B %d, %Y'))
        date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        date_para.runs[0].font.color.rgb = RGBColor(128, 128, 128)

        doc.add_paragraph('')  # Spacer

        # Add sections or plain content
        if sections:
            for section in sections:
                heading = section.get('heading', '')
                body = section.get('content', '')
                level = section.get('level', 1)

                if heading:
                    doc.add_heading(heading, level=level)
                if body:
                    doc.add_paragraph(body)
        elif content:
            for paragraph in content.split('\n'):
                if paragraph.strip():
                    doc.add_paragraph(paragraph.strip())

        # Save
        filename = self._safe_filename(title) + '.docx'
        filepath = os.path.join(self.output_dir, filename)
        doc.save(filepath)
        
        # Open the file automatically on the laptop
        try:
            os.startfile(filepath)
        except:
            pass

        return {
            'data': {'message': f'Document "{title}" created', 'path': filepath},
            'filesCreated': [{'name': filename, 'path': filepath, 'type': 'document',
                              'mimeType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                              'size': os.path.getsize(filepath)}],
        }

    def edit(self, path='', operations=None, **kwargs):
        """Edit an existing Word document"""
        if not os.path.exists(path):
            raise FileNotFoundError(f'Document not found: {path}')

        doc = Document(path)

        if operations:
            for op in operations:
                op_type = op.get('type')
                if op_type == 'add_paragraph':
                    doc.add_paragraph(op.get('text', ''))
                elif op_type == 'add_heading':
                    doc.add_heading(op.get('text', ''), level=op.get('level', 1))
                elif op_type == 'replace':
                    self._replace_text(doc, op.get('find', ''), op.get('replace', ''))

        doc.save(path)
        
        # Open the file automatically
        try:
            os.startfile(path)
        except:
            pass

        return {'data': {'message': f'Document edited', 'path': path}}

    def export_pdf(self, path='', **kwargs):
        """Export document info (actual PDF conversion needs LibreOffice)"""
        return {'data': {'message': 'PDF export queued', 'path': path,
                         'note': 'Requires LibreOffice for conversion'}}

    def _apply_template(self, doc, template):
        """Apply styling based on template name"""
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Calibri'
        font.size = Pt(11)

        if template == 'formal':
            font.name = 'Times New Roman'
            font.size = Pt(12)
        elif template == 'modern':
            font.name = 'Arial'
            font.size = Pt(11)

    def _replace_text(self, doc, find, replace):
        for para in doc.paragraphs:
            if find in para.text:
                for run in para.runs:
                    if find in run.text:
                        run.text = run.text.replace(find, replace)

    def _safe_filename(self, name):
        return "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()

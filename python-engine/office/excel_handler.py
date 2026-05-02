"""Excel Spreadsheet Handler"""

import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, Reference
from openpyxl.utils import get_column_letter


class ExcelHandler:
    def __init__(self):
        self.output_dir = os.path.expanduser('~/Documents/PocketAI')
        os.makedirs(self.output_dir, exist_ok=True)

    def create(self, title='Untitled', headers=None, rows=None,
               formulas=None, chart=None, **kwargs):
        """Create a new Excel spreadsheet"""
        wb = Workbook()
        ws = wb.active
        ws.title = title[:31]  # Excel sheet name limit

        # Header styling
        header_font = Font(bold=True, color='FFFFFF', size=11)
        header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
        header_align = Alignment(horizontal='center', vertical='center')

        # Add headers
        if headers:
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_align
                ws.column_dimensions[get_column_letter(col)].width = max(len(str(header)) + 4, 12)

        # Add data rows
        if rows:
            for row_idx, row_data in enumerate(rows, 2):
                for col_idx, value in enumerate(row_data, 1):
                    ws.cell(row=row_idx, column=col_idx, value=value)

        # Add formulas
        if formulas:
            for formula in formulas:
                cell = formula.get('cell', 'A1')
                expr = formula.get('formula', '')
                ws[cell] = expr

        # Add chart if requested
        if chart and headers and rows:
            chart_obj = BarChart()
            chart_obj.title = chart.get('title', title)
            chart_obj.style = 10
            data_ref = Reference(ws, min_col=2, min_row=1, max_row=len(rows) + 1, max_col=len(headers))
            cats = Reference(ws, min_col=1, min_row=2, max_row=len(rows) + 1)
            chart_obj.add_data(data_ref, titles_from_data=True)
            chart_obj.set_categories(cats)
            ws.add_chart(chart_obj, 'A' + str(len(rows) + 4))

        # Auto-filter
        if headers:
            ws.auto_filter.ref = f'A1:{get_column_letter(len(headers))}{len(rows or []) + 1}'

        filename = self._safe_filename(title) + '.xlsx'
        filepath = os.path.join(self.output_dir, filename)
        wb.save(filepath)

        return {
            'data': {'message': f'Spreadsheet "{title}" created', 'path': filepath},
            'filesCreated': [{'name': filename, 'path': filepath, 'type': 'spreadsheet',
                              'mimeType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                              'size': os.path.getsize(filepath)}],
        }

    def _safe_filename(self, name):
        return "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()

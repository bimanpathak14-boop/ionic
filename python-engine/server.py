"""
Pocket AI Office - Python Automation Engine
Handles: Office docs, coding, creative, system, browser automation
Communication: JSON via stdin/stdout with the Electron desktop agent
"""

import sys
import json
import traceback
import asyncio
import os

# Module imports
from office.word_handler import WordHandler
from office.excel_handler import ExcelHandler
from office.powerpoint_handler import PowerPointHandler
from coding.vscode_handler import VSCodeHandler
from creative.image_handler import ImageHandler
from system.system_handler import SystemHandler
from browser.browser_handler import BrowserHandler

class PocketAIEngine:
    def __init__(self):
        # Initialize single instances of handlers
        word = WordHandler()
        excel = ExcelHandler()
        pptx = PowerPointHandler()
        vscode = VSCodeHandler()
        image = ImageHandler()
        system = SystemHandler()
        browser = BrowserHandler()

        self.handlers = {
            'office': {
                'create_document': word.create,
                'create_new_document': word.create,
                'edit_document': word.edit,
                'create_spreadsheet': excel.create,
                'create_presentation': pptx.create,
                'export_pdf': word.export_pdf,
                'add_image_to_doc': word.add_image,
            },
            'coding': {
                'open_vscode': vscode.open_vscode,
                'create_project': vscode.create_project,
                'edit_file': vscode.edit_file,
                'create_file': vscode.create_file,
                'run_command': vscode.run_command,
            },
            'creative': {
                'generate_image': image.generate,
                'edit_image': image.edit,
                'resize_image': image.resize,
                'convert_image': image.convert,
            },
            'system': {
                'launch_app': system.launch_app,
                'launch_ms_word': lambda **kw: system.launch_app(app_name='word'),
                'open_ms_word': lambda **kw: system.launch_app(app_name='word'),
                'type_text': system.type_text,
                'type': system.type_text,
                'list_files': system.list_files,
                'create_folder': system.create_folder,
                'move_file': system.move_file,
                'delete_file': system.delete_file,
                'screenshot': system.screenshot,
                'media_control': system.media_control,
                'get_clipboard': system.get_clipboard,
                'set_clipboard': system.set_clipboard,
                'run_terminal': system.run_terminal,
                'cancel': system.cancel_task,
                'get_system_info': system.get_system_info,
            },
            'browser': {
                'open_url': browser.open_url,
                'search': browser.search,
                'take_screenshot': browser.take_screenshot,
            },
        }
        self.running_tasks = {}

    def process_request(self, request):
        """Process a single request from the Electron bridge"""
        request_id = request.get('requestId')
        module = request.get('module')
        action = request.get('action')
        params = request.get('params', {})

        try:
            if module not in self.handlers:
                return self.error_response(request_id, f'Unknown module: {module}')

            if action not in self.handlers[module]:
                return self.error_response(request_id, f'Unknown action: {action} in module {module}')

            handler = self.handlers[module][action]
            result = handler(**params) if params else handler()

            return {
                'requestId': request_id,
                'success': True,
                'data': result.get('data', {}),
                'filesCreated': result.get('filesCreated', []),
            }
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            return self.error_response(request_id, str(e))

    def error_response(self, request_id, message):
        return {
            'requestId': request_id,
            'success': False,
            'error': message,
        }

    def run(self):
        """Main loop — read JSON from stdin, write JSON to stdout"""
        print('{"status":"ready","engine":"PocketAIEngine"}', flush=True)

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
                response = self.process_request(request)
                print(json.dumps(response), flush=True)
            except json.JSONDecodeError:
                print(json.dumps({'error': 'Invalid JSON'}), flush=True)
            except Exception as e:
                print(json.dumps({'error': str(e)}), flush=True)

if __name__ == '__main__':
    engine = PocketAIEngine()
    engine.run()

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
        self.handlers = {
            'office': {
                'create_document': WordHandler().create,
                'create_new_document': WordHandler().create, # Alias
                'edit_document': WordHandler().edit,
                'create_spreadsheet': ExcelHandler().create,
                'create_presentation': PowerPointHandler().create,
                'export_pdf': WordHandler().export_pdf,
                'add_image_to_doc': WordHandler().add_image,
            },
            'coding': {
                'open_vscode': VSCodeHandler().open_vscode,
                'create_project': VSCodeHandler().create_project,
                'edit_file': VSCodeHandler().edit_file,
                'create_file': VSCodeHandler().create_file,
                'run_command': VSCodeHandler().run_command,
            },
            'creative': {
                'generate_image': ImageHandler().generate,
                'edit_image': ImageHandler().edit,
                'resize_image': ImageHandler().resize,
                'convert_image': ImageHandler().convert,
            },
            'system': {
                'launch_app': SystemHandler().launch_app,
                'launch_ms_word': lambda **kw: SystemHandler().launch_app(app_name='word'), # Alias
                'open_ms_word': lambda **kw: SystemHandler().launch_app(app_name='word'), # Alias
                'type_text': SystemHandler().type_text,
                'type': SystemHandler().type_text, # Alias
                'list_files': SystemHandler().list_files,
                'create_folder': SystemHandler().create_folder,
                'move_file': SystemHandler().move_file,
                'delete_file': SystemHandler().delete_file,
                'screenshot': SystemHandler().screenshot,
                'media_control': SystemHandler().media_control,
                'get_clipboard': SystemHandler().get_clipboard,
                'set_clipboard': SystemHandler().set_clipboard,
                'run_terminal': SystemHandler().run_terminal,
                'cancel': SystemHandler().cancel_task,
                'get_system_info': SystemHandler().get_system_info,
            },
            'browser': {
                'open_url': BrowserHandler().open_url,
                'search': BrowserHandler().search,
                'take_screenshot': BrowserHandler().take_screenshot,
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

"""System Control Handler — App launching, file ops, screenshots"""

import os
import sys
import json
import shutil
import subprocess
import platform
import psutil
import base64


class SystemHandler:
    def __init__(self):
        self.running_tasks = {}

    def launch_app(self, app_name='', path=None, **kwargs):
        """Launch a desktop application"""
        app_map = {
            'notepad': 'notepad.exe',
            'calculator': 'calc.exe',
            'explorer': 'explorer.exe',
            'paint': 'mspaint.exe',
            'word': 'winword.exe',
            'excel': 'excel.exe',
            'powerpoint': 'powerpnt.exe',
            'chrome': 'chrome.exe',
            'firefox': 'firefox.exe',
            'edge': 'msedge.exe',
            'vscode': 'code',
            'cmd': 'cmd.exe',
            'powershell': 'powershell.exe',
            'terminal': 'wt.exe',
        }

        target = path or app_map.get(app_name.lower(), app_name)

        try:
            if platform.system() == 'Windows':
                subprocess.Popen(f'start "" "{target}"', shell=True)
            elif platform.system() == 'Darwin':
                subprocess.Popen(['open', '-a', target])
            else:
                subprocess.Popen([target])

            return {'data': {'message': f'Launched: {app_name or target}'}}
        except Exception as e:
            return {'data': {'error': f'Failed to launch {app_name}: {str(e)}'}}

    def list_files(self, directory=None, pattern='*', **kwargs):
        """List files in a directory"""
        target_dir = directory or os.path.expanduser('~/Documents')
        if not os.path.exists(target_dir):
            raise FileNotFoundError(f'Directory not found: {target_dir}')

        entries = []
        for entry in os.scandir(target_dir):
            entries.append({
                'name': entry.name,
                'path': entry.path,
                'is_dir': entry.is_directory(),
                'size': entry.stat().st_size if entry.is_file() else 0,
                'modified': entry.stat().st_mtime,
            })

        entries.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        return {'data': {'directory': target_dir, 'entries': entries[:200]}}

    def create_folder(self, path='', **kwargs):
        """Create a folder"""
        os.makedirs(path, exist_ok=True)
        return {'data': {'message': f'Folder created: {path}', 'path': path}}

    def move_file(self, source='', destination='', **kwargs):
        """Move or rename a file"""
        if not os.path.exists(source):
            raise FileNotFoundError(f'Source not found: {source}')
        shutil.move(source, destination)
        return {'data': {'message': f'Moved: {source} → {destination}'}}

    def delete_file(self, path='', **kwargs):
        """Delete a file or folder"""
        if not os.path.exists(path):
            raise FileNotFoundError(f'Not found: {path}')
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        return {'data': {'message': f'Deleted: {path}'}}

    def screenshot(self, **kwargs):
        """Take a screenshot"""
        try:
            import pyscreenshot as ImageGrab
            img = ImageGrab.grab()
            output_dir = os.path.expanduser('~/Documents/PocketAI/Screenshots')
            os.makedirs(output_dir, exist_ok=True)
            filepath = os.path.join(output_dir, 'screenshot.png')
            img.save(filepath)

            # Also return base64 for live preview
            import io
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            b64 = base64.b64encode(buffer.getvalue()).decode()

            return {
                'data': {'message': 'Screenshot captured', 'path': filepath, 'base64': b64[:100000]},
                'filesCreated': [{'name': 'screenshot.png', 'path': filepath,
                                  'type': 'image', 'mimeType': 'image/png'}],
            }
        except Exception as e:
            return {'data': {'error': f'Screenshot failed: {str(e)}'}}

    def get_system_info(self, **kwargs):
        """Get system information"""
        return {
            'data': {
                'platform': platform.system(),
                'platform_version': platform.version(),
                'hostname': platform.node(),
                'cpu_count': psutil.cpu_count(),
                'cpu_percent': psutil.cpu_percent(interval=1),
                'memory_total_gb': round(psutil.virtual_memory().total / (1024**3), 2),
                'memory_used_percent': psutil.virtual_memory().percent,
                'disk_usage_percent': psutil.disk_usage('/').percent if platform.system() != 'Windows'
                    else psutil.disk_usage('C:\\').percent,
            }
        }

    def cancel_task(self, taskId='', **kwargs):
        """Cancel a running task"""
        if taskId in self.running_tasks:
            proc = self.running_tasks.pop(taskId)
            proc.kill()
            return {'data': {'message': f'Task {taskId} cancelled'}}
        return {'data': {'message': f'Task {taskId} not found or already completed'}}

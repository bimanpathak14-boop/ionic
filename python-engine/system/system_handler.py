"""System Control Handler — App launching, file ops, screenshots"""

import os
import sys
import json
import shutil
import subprocess
import platform
import psutil
import base64


import pyautogui
import time

class SystemHandler:
    def __init__(self):
        self.running_tasks = {}
        pyautogui.FAILSAFE = True

    def type_text(self, text='', interval=0.01, press_enter=True, app_hint=None, **kwargs):
        """Type text into the active window. Supports Unicode via clipboard on Windows."""
        try:
            print(f"DEBUG: Starting type_text. Length: {len(text)}, Hint: {app_hint}", file=sys.stderr)
            
            # If app hint is provided, try to launch it first
            if app_hint:
                print(f"DEBUG: Launching app hint: {app_hint}", file=sys.stderr)
                self.launch_app(app_name=app_hint)
                time.sleep(3) # Wait for app to open and take focus
            else:
                # Short delay to let user switch window if needed
                time.sleep(1.5) 

            # Check if text is mostly ASCII
            is_ascii = all(ord(c) < 128 for c in text)

            if platform.system() == 'Windows' and not is_ascii:
                # Use clipboard for Unicode (Hindi, etc.) on Windows
                try:
                    import ctypes
                    # Basic clipboard support using ctypes to avoid dependencies
                    CF_UNICODETEXT = 13
                    user32 = ctypes.windll.user32
                    kernel32 = ctypes.windll.kernel32

                    text_bytes = text.encode('utf-16le') + b'\x00\x00'
                    h_mem = kernel32.GlobalAlloc(0x0042, len(text_bytes))
                    p_mem = kernel32.GlobalLock(h_mem)
                    ctypes.memmove(p_mem, text_bytes, len(text_bytes))
                    kernel32.GlobalUnlock(h_mem)

                    if user32.OpenClipboard(0):
                        user32.EmptyClipboard()
                        user32.SetClipboardData(CF_UNICODETEXT, h_mem)
                        user32.CloseClipboard()
                        
                        # Paste using keyboard shortcut
                        pyautogui.hotkey('ctrl', 'v')
                        print("DEBUG: Typed via clipboard (Unicode)", file=sys.stderr)
                    else:
                        raise Exception("Could not open clipboard")
                except Exception as clipboard_err:
                    print(f"DEBUG: Clipboard failed: {clipboard_err}. Falling back to write.", file=sys.stderr)
                    pyautogui.write(text, interval=interval)
            else:
                # Standard ASCII typing
                pyautogui.write(text, interval=interval)
                print("DEBUG: Typed via pyautogui.write", file=sys.stderr)

            if press_enter:
                pyautogui.press('enter')
            
            return {'data': {'message': 'Typing completed successfully'}}
        except Exception as e:
            print(f"DEBUG: Typing error: {str(e)}", file=sys.stderr)
            return {'data': {'error': f'Typing failed: {str(e)}'}}

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
            'word_blank': 'winword.exe /w',
            'excel_blank': 'excel /e',
            'powerpnt_blank': 'powerpnt /s',
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

    def media_control(self, action='playpause', **kwargs):
        """Control media playback (play, pause, volume, etc.)"""
        actions = {
            'playpause': 'playpause',
            'next': 'nexttrack',
            'prev': 'prevtrack',
            'volup': 'volumeup',
            'voldown': 'volumedown',
            'mute': 'volumemute',
            'stop': 'stop',
        }
        
        target = actions.get(action.lower())
        if target:
            pyautogui.press(target)
            return {'data': {'message': f'Media action: {action}'}}
        return {'data': {'error': f'Unknown media action: {action}'}}

    def get_clipboard(self, **kwargs):
        """Get current clipboard text"""
        try:
            import ctypes
            CF_UNICODETEXT = 13
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            if user32.OpenClipboard(0):
                h_data = user32.GetClipboardData(CF_UNICODETEXT)
                if h_data:
                    p_data = kernel32.GlobalLock(h_data)
                    text = ctypes.wstring_at(p_data)
                    kernel32.GlobalUnlock(h_data)
                    user32.CloseClipboard()
                    return {'data': {'text': text}}
                user32.CloseClipboard()
            return {'data': {'text': ''}}
        except Exception as e:
            return {'data': {'error': str(e)}}

    def set_clipboard(self, text='', **kwargs):
        """Set clipboard text"""
        try:
            import ctypes
            CF_UNICODETEXT = 13
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            text_bytes = text.encode('utf-16le') + b'\x00\x00'
            h_mem = kernel32.GlobalAlloc(0x0042, len(text_bytes))
            p_mem = kernel32.GlobalLock(h_mem)
            ctypes.memmove(p_mem, text_bytes, len(text_bytes))
            kernel32.GlobalUnlock(h_mem)

            if user32.OpenClipboard(0):
                user32.EmptyClipboard()
                user32.SetClipboardData(CF_UNICODETEXT, h_mem)
                user32.CloseClipboard()
                return {'data': {'message': 'Clipboard updated'}}
            return {'data': {'error': 'Could not open clipboard'}}
        except Exception as e:
            return {'data': {'error': str(e)}}

    def run_terminal(self, command='', **kwargs):
        """Run a command in CMD/Terminal and return output"""
        try:
            # On Windows, we use cmd /c
            if platform.system() == 'Windows':
                result = subprocess.run(f'cmd /c "{command}"', shell=True, capture_output=True, text=True, timeout=30)
            else:
                result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
            
            return {
                'data': {
                    'stdout': result.stdout[:5000],
                    'stderr': result.stderr[:2000],
                    'exit_code': result.returncode
                }
            }
        except Exception as e:
            return {'data': {'error': str(e)}}

    def cancel_task(self, taskId='', **kwargs):
        """Cancel a running task"""
        if taskId in self.running_tasks:
            proc = self.running_tasks.pop(taskId)
            proc.kill()
            return {'data': {'message': f'Task {taskId} cancelled'}}
        return {'data': {'message': f'Task {taskId} not found or already completed'}}

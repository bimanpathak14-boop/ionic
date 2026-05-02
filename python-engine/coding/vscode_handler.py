"""VS Code & Coding Automation Handler"""

import os
import subprocess
import json


class VSCodeHandler:
    def __init__(self):
        self.output_dir = os.path.expanduser('~/Documents/PocketAI/Projects')
        os.makedirs(self.output_dir, exist_ok=True)

    def open_vscode(self, path=None, **kwargs):
        """Open VS Code, optionally with a specific folder/file"""
        target = path or self.output_dir
        subprocess.Popen(['code', target], shell=True)
        return {'data': {'message': f'VS Code opened: {target}'}}

    def create_project(self, name='my-project', template='node', **kwargs):
        """Create a new project from template"""
        project_dir = os.path.join(self.output_dir, name)
        os.makedirs(project_dir, exist_ok=True)

        files_created = []

        if template == 'node':
            files_created = self._create_node_project(project_dir, name)
        elif template == 'python':
            files_created = self._create_python_project(project_dir, name)
        elif template == 'html':
            files_created = self._create_html_project(project_dir, name)
        elif template == 'react':
            files_created = self._create_react_project(project_dir, name)
        else:
            files_created = self._create_basic_project(project_dir, name)

        # Open in VS Code
        subprocess.Popen(['code', project_dir], shell=True)

        return {
            'data': {'message': f'Project "{name}" created ({template})', 'path': project_dir},
            'filesCreated': files_created,
        }

    def edit_file(self, path='', content='', append=False, **kwargs):
        """Edit or create a file with content"""
        if not path:
            raise ValueError('File path required')

        os.makedirs(os.path.dirname(path), exist_ok=True)
        mode = 'a' if append else 'w'
        with open(path, mode, encoding='utf-8') as f:
            f.write(content)

        return {
            'data': {'message': f'File edited: {path}', 'path': path},
            'filesCreated': [{'name': os.path.basename(path), 'path': path,
                              'type': 'code', 'size': os.path.getsize(path)}],
        }

    def create_file(self, path='', content='', **kwargs):
        """Create a new file"""
        return self.edit_file(path=path, content=content)

    def run_command(self, command='', cwd=None, **kwargs):
        """Run a shell command"""
        try:
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True,
                timeout=60, cwd=cwd or self.output_dir
            )
            return {
                'data': {
                    'stdout': result.stdout[:5000],
                    'stderr': result.stderr[:2000],
                    'returncode': result.returncode,
                }
            }
        except subprocess.TimeoutExpired:
            return {'data': {'error': 'Command timed out (60s limit)'}}

    def _create_node_project(self, project_dir, name):
        pkg = {
            'name': name, 'version': '1.0.0', 'description': f'{name} - Created by Pocket AI',
            'main': 'index.js', 'scripts': {'start': 'node index.js', 'dev': 'nodemon index.js'},
        }
        files = [
            ('package.json', json.dumps(pkg, indent=2)),
            ('index.js', f'// {name} - Created by Pocket AI Office\nconsole.log("Hello from {name}!");\n'),
            ('.gitignore', 'node_modules/\n.env\n'),
            ('README.md', f'# {name}\n\nCreated by Pocket AI Office.\n'),
        ]
        return self._write_files(project_dir, files)

    def _create_python_project(self, project_dir, name):
        files = [
            ('main.py', f'"""{ name} - Created by Pocket AI Office"""\n\ndef main():\n    print("Hello from {name}!")\n\nif __name__ == "__main__":\n    main()\n'),
            ('requirements.txt', '# Add your dependencies here\n'),
            ('.gitignore', '__pycache__/\n*.pyc\nvenv/\n.env\n'),
            ('README.md', f'# {name}\n\nCreated by Pocket AI Office.\n'),
        ]
        return self._write_files(project_dir, files)

    def _create_html_project(self, project_dir, name):
        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{name}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>{name}</h1>
    <p>Created by Pocket AI Office</p>
    <script src="script.js"></script>
</body>
</html>'''
        files = [
            ('index.html', html),
            ('style.css', '* {{ margin: 0; padding: 0; box-sizing: border-box; }}\nbody {{ font-family: sans-serif; padding: 2rem; }}\n'),
            ('script.js', f'// {name}\nconsole.log("Ready!");\n'),
        ]
        return self._write_files(project_dir, files)

    def _create_react_project(self, project_dir, name):
        """Create basic React project structure"""
        files = [
            ('package.json', json.dumps({
                'name': name, 'version': '1.0.0', 'private': True,
                'scripts': {'dev': 'vite', 'build': 'vite build'},
            }, indent=2)),
            ('src/App.jsx', f'export default function App() {{\n  return <div><h1>{name}</h1></div>;\n}}\n'),
            ('src/main.jsx', "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n"),
            ('index.html', f'<!DOCTYPE html><html><head><title>{name}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>'),
        ]
        return self._write_files(project_dir, files)

    def _create_basic_project(self, project_dir, name):
        files = [
            ('README.md', f'# {name}\n\nCreated by Pocket AI Office.\n'),
        ]
        return self._write_files(project_dir, files)

    def _write_files(self, base_dir, files):
        created = []
        for rel_path, content in files:
            full_path = os.path.join(base_dir, rel_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            created.append({
                'name': os.path.basename(rel_path), 'path': full_path,
                'type': 'code', 'size': os.path.getsize(full_path),
            })
        return created

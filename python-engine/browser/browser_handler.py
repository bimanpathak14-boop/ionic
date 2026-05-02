"""Browser Automation Handler"""

import subprocess
import platform
import webbrowser


class BrowserHandler:
    def __init__(self):
        pass

    def open_url(self, url='https://google.com', browser=None, **kwargs):
        """Open a URL in the default or specified browser"""
        try:
            if browser:
                browser_map = {
                    'chrome': 'google-chrome' if platform.system() == 'Linux' else 'chrome',
                    'firefox': 'firefox',
                    'edge': 'msedge',
                }
                browser_name = browser_map.get(browser.lower(), browser)
                if platform.system() == 'Windows':
                    subprocess.Popen(f'start {browser_name} "{url}"', shell=True)
                else:
                    subprocess.Popen([browser_name, url])
            else:
                webbrowser.open(url)

            return {'data': {'message': f'Opened: {url}'}}
        except Exception as e:
            return {'data': {'error': f'Failed to open URL: {str(e)}'}}

    def search(self, query='', engine='google', **kwargs):
        """Search the web"""
        engines = {
            'google': f'https://www.google.com/search?q={query}',
            'bing': f'https://www.bing.com/search?q={query}',
            'duckduckgo': f'https://duckduckgo.com/?q={query}',
            'youtube': f'https://www.youtube.com/results?search_query={query}',
        }
        url = engines.get(engine.lower(), engines['google'])
        webbrowser.open(url)
        return {'data': {'message': f'Searching: {query}', 'url': url}}

    def take_screenshot(self, **kwargs):
        """Take browser screenshot (delegates to system handler)"""
        return {'data': {'message': 'Use system screenshot for browser capture'}}

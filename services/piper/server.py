import io
import json
import os
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from piper import PiperVoice, SynthesisConfig

voice = PiperVoice.load(os.environ.get('PIPER_MODEL', '/models/ru_RU-denis-medium.onnx'))
lock = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path != '/health':
            self.send_error(404)
            return
        body = b'{"status":"ready","voice":"ru_RU-denis-medium"}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/synthesize':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 12000:
                raise ValueError()
            text = json.loads(self.rfile.read(size)).get('text')
            if not isinstance(text, str) or not 0 < len(text) <= 1400:
                raise ValueError()
        except (ValueError, TypeError):
            self.send_error(400)
            return
        if not lock.acquire(timeout=2):
            self.send_error(429)
            return
        try:
            output = io.BytesIO()
            with wave.open(output, 'wb') as wav:
                voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1.03, noise_scale=0.55, noise_w_scale=0.7))
            body = output.getvalue()
            self.send_response(200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            self.send_error(500)
        finally:
            lock.release()

ThreadingHTTPServer(('0.0.0.0', 8000), Handler).serve_forever()

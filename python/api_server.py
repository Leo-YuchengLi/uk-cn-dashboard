#!/usr/bin/env python3
"""
Simple HTTP API server for dev mode (no Electron).
Serves SQLite queries via JSON API.
"""

import json
import sqlite3
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'airline.db')


class APIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/snapshots':
            self.handle_snapshots()
        elif path == '/api/query':
            params = parse_qs(parsed.query)
            sql = params.get('sql', [''])[0]
            self.handle_query(sql)
        elif path.startswith('/api/sheet/'):
            parts = path.split('/')
            sheet_name = parts[3] if len(parts) > 3 else ''
            snap = parse_qs(parsed.query).get('snapshot', [''])[0]
            self.handle_sheet(sheet_name, snap)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/query':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            sql = body.get('sql', '')
            params = body.get('params', [])
            self.handle_query(sql, params)
        else:
            self.send_error(404)

    def handle_snapshots(self):
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute('SELECT * FROM snapshots ORDER BY snapshot_date DESC').fetchall()
            conn.close()
            self.json_response([dict(r) for r in rows])
        except Exception as e:
            self.json_response({'error': str(e)}, 500)

    def handle_sheet(self, sheet_name, snapshot):
        try:
            conn = sqlite3.connect(DB_PATH)
            row = conn.execute(
                'SELECT data_json FROM sheet_data WHERE sheet_name=? AND snapshot_date=?',
                (sheet_name, snapshot)
            ).fetchone()
            conn.close()
            if row:
                self.json_response(json.loads(row[0]))
            else:
                self.json_response({'error': f'Sheet {sheet_name} not found for {snapshot}'}, 404)
        except Exception as e:
            self.json_response({'error': str(e)}, 500)

    def handle_query(self, sql, params=None):
        if not sql:
            self.json_response({'error': 'No SQL provided'}, 400)
            return

        # Basic safety check
        sql_upper = sql.strip().upper()
        if not sql_upper.startswith('SELECT'):
            self.json_response({'error': 'Only SELECT queries allowed'}, 403)
            return

        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params or []).fetchall()
            conn.close()
            self.json_response([dict(r) for r in rows])
        except Exception as e:
            self.json_response({'error': str(e)}, 500)

    def json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress default logging


if __name__ == '__main__':
    port = 3456
    print(f"API server running at http://localhost:{port}")
    HTTPServer(('', port), APIHandler).serve_forever()

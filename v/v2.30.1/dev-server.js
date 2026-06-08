import { createServer } from 'https';
import { readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { readFile } from 'fs/promises';

const PORT = 8443;
const LOG_FILE = join(import.meta.dirname, 'dev-log.txt');
const STATIC_ROOT = import.meta.dirname;

const MIME_TYPES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

writeFileSync(LOG_FILE, `--- Dev log started ${new Date().toISOString()} ---\n`);

const server = createServer({
    key: readFileSync(join(STATIC_ROOT, 'key.pem')),
    cert: readFileSync(join(STATIC_ROOT, 'cert.pem')),
}, async (req, res) => {
    // CORS for same-origin is fine; add headers for flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Log endpoint
    if (req.method === 'POST' && req.url === '/api/log') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            appendFileSync(LOG_FILE, body + '\n');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
        });
        return;
    }

    // Clear log endpoint
    if (req.method === 'POST' && req.url === '/api/log/clear') {
        writeFileSync(LOG_FILE, `--- Log cleared ${new Date().toISOString()} ---\n`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('cleared');
        return;
    }

    // Static file serving
    let filePath = req.url.split('?')[0];
    if (filePath === '/') filePath = '/index.html';
    const fullPath = join(STATIC_ROOT, filePath);

    // Prevent directory traversal
    if (!fullPath.startsWith(STATIC_ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const data = await readFile(fullPath);
        const ext = extname(fullPath);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dev server running on https://0.0.0.0:${PORT}`);
    console.log(`📋 Logs written to: ${LOG_FILE}`);
    console.log(`   Read with: cat ${LOG_FILE}`);
});

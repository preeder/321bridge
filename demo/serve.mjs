// Serves the demo as two different sites, so the frame is genuinely third party to the host page:
//   host page  http://localhost:8091
//   frame      http://127.0.0.1:8092
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const serve = (port, host, routes) =>
	createServer((req, res) => {
		const path = new URL(req.url, 'http://x').pathname;
		const file = routes[path];
		const full = file && normalize(join(root, file));
		if (!full || !existsSync(full)) {
			res.writeHead(404).end('not found');
			return;
		}
		res.writeHead(200, { 'content-type': types[extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
		createReadStream(full).pipe(res);
	}).listen(port, host, () => console.log(`http://${host}:${port}`));

serve(8091, 'localhost', { '/': 'demo/host.html', '/321bridge-host.js': 'dist/321bridge-host.js' });
serve(8092, '127.0.0.1', { '/': 'demo/frame.html', '/321bridge-frame.js': 'dist/321bridge-frame.js' });

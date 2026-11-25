import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';
import api from './src/server/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable gzip/brotli compression for all routes & static assets
app.use(compression({
  threshold: 256,
  level: 6
}));

// Serve API routes
app.use('/api', api);
app.use('/uniaopet/api', api);

// Serve frontend static build files
const candidatePaths = [
  path.resolve(process.cwd(), 'dist'),
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, 'dist')
];
const distPath = candidatePaths.find(p => fs.existsSync(p)) || path.resolve(process.cwd(), 'dist');

console.log(`[União Pet] Serving static files from: ${distPath}`);

// Optimized static asset serving with caching headers
const staticOptions = {
  maxAge: '7d',
  setHeaders: (res: express.Response, filePath: string) => {
    if (filePath.includes(path.sep + 'assets' + path.sep)) {
      // Hashed assets can be cached for a long time
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.html')) {
      // HTML files should always re-validate to pick up latest build
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
};

app.use(express.static(distPath, staticOptions));
app.use('/uniaopet', express.static(distPath, staticOptions));

// SPA Fallback for client-side routing
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` 🐾 União Pet — Servidor ultra-rápido rodando em produção!`);
  console.log(` ➜ Local: http://localhost:${PORT}/uniaopet/`);
  console.log(` ➜ Gzip/Compression: Ativado`);
  console.log(` ➜ Banco de Dados: uniao_pet_db.json (com cache em RAM)`);
  console.log(`==================================================\n`);
});

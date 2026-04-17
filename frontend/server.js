/**
 * Serveur de production Railway — RCCM Frontend
 *
 * Sert les fichiers statiques React ET proxie /api/* vers le backend Django.
 * Élimine le besoin de CORS : le navigateur n'appelle qu'un seul domaine.
 *
 * Variables d'environnement :
 *   PORT        — port injecté par Railway (obligatoire)
 *   BACKEND_URL — URL complète du backend Django  (ex: https://rccm.up.railway.app)
 */

const express              = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path                 = require('path');

const app        = express();
const PORT       = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

console.log(`[RCCM] Proxy backend → ${BACKEND_URL}`);

// ── Proxy /api/* → backend Django ─────────────────────────────────────────────
app.use(
  '/api',
  createProxyMiddleware({
    target:       BACKEND_URL,
    changeOrigin: true,
    on: {
      error: (err, req, res) => {
        console.error('[proxy] erreur :', err.message);
        res.status(502).json({ detail: 'Backend indisponible', error: err.message });
      },
    },
  })
);

// ── Fichiers statiques React ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'build')));

// ── SPA fallback : toutes les routes React renvoient index.html ───────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[RCCM] Frontend + proxy démarré sur le port ${PORT}`);
});

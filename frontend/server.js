/**
 * Serveur de production Railway — RCCM Frontend
 *
 * Sert les fichiers statiques React ET proxie /api/* vers le backend Django.
 * Élimine le besoin de CORS : le navigateur n'appelle qu'un seul domaine.
 *
 * Variables d'environnement :
 *   PORT        — port injecté par Railway (obligatoire)
 *   BACKEND_URL — URL complète du backend Django  (ex: https://rccm-backend.up.railway.app)
 *
 * Notes Railway :
 *   - Le backend Django peut mettre 60-90s à démarrer (migrations, collectstatic, seed).
 *   - proxyTimeout doit être ≥ 90s pour couvrir la génération de PDF volumineux.
 *   - Le healthcheck Railway (/api/health/) empêche le routage avant que Django soit prêt.
 */

const express                   = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path                      = require('path');

const app         = express();
const PORT        = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

console.log(`[RCCM] Proxy backend → ${BACKEND_URL}`);

// ── Proxy /api/* → backend Django ─────────────────────────────────────────────
app.use(
  '/api',
  createProxyMiddleware({
    target:       BACKEND_URL,
    changeOrigin: true,
    // 120s : couvre les PDF volumineux (registre chronologique complet, etc.)
    proxyTimeout: 120_000,
    timeout:      120_000,
    on: {
      error: (err, req, res) => {
        const isPdfPath = req.path && req.path.includes('/rapports/');
        console.error(`[proxy] erreur sur ${req.method} ${req.path} :`, err.message);
        // Réponse JSON structurée — le frontend React l'interprète comme un 502
        if (res && !res.headersSent) {
          res.status(502).json({
            detail:    'Le service de génération des actes est momentanément indisponible.',
            detail_ar: 'خدمة إصدار الوثائق الرسمية غير متاحة مؤقتاً.',
            code:      'BACKEND_UNAVAILABLE',
            path:      req.path,
          });
        }
      },
      proxyReqError: (err, req, res) => {
        console.error(`[proxy] erreur de connexion vers ${BACKEND_URL}${req.path} :`, err.code, err.message);
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

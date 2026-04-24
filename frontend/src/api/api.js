import axios from 'axios';

// En développement : http://localhost:8000/api
// En production     : /api  (servi par nginx)
const API_HOST = process.env.REACT_APP_API_URL || '';
const BASE_URL = `${API_HOST}/api`;

// ─────────────────────────────────────────────────────────────────────────────
// ── Système de notification PDF (DOM pur — fonctionne hors composant React) ──
// ─────────────────────────────────────────────────────────────────────────────

const _NOTIF_THEMES = {
  error: {
    accent:  '#ff4d4f',
    bg:      '#fff2f0',
    border:  '#ffccc7',
    iconBg:  '#ff4d4f',
    icon:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
               <circle cx="12" cy="12" r="10"/>
               <line x1="15" y1="9" x2="9" y2="15"/>
               <line x1="9" y1="9" x2="15" y2="15"/>
             </svg>`,
  },
  warning: {
    accent:  '#faad14',
    bg:      '#fffbe6',
    border:  '#ffe58f',
    iconBg:  '#faad14',
    icon:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
               <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
               <line x1="12" y1="9" x2="12" y2="13"/>
               <line x1="12" y1="17" x2="12.01" y2="17"/>
             </svg>`,
  },
  info: {
    accent:  '#1677ff',
    bg:      '#e6f4ff',
    border:  '#91caff',
    iconBg:  '#1677ff',
    icon:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
               <circle cx="12" cy="12" r="10"/>
               <line x1="12" y1="16" x2="12" y2="12"/>
               <line x1="12" y1="8" x2="12.01" y2="8"/>
             </svg>`,
  },
};

/** Injecte une fois les keyframes CSS nécessaires */
const _ensureNotifStyles = () => {
  if (document.getElementById('__pdf-notif-css')) return;
  const s = document.createElement('style');
  s.id = '__pdf-notif-css';
  s.textContent = `
    @keyframes __notifIn  { from { opacity:0; transform:translateX(110%); }
                             to   { opacity:1; transform:translateX(0);    } }
    @keyframes __notifOut { from { opacity:1; transform:translateX(0);    max-height:200px; margin-bottom:10px; }
                             to   { opacity:0; transform:translateX(110%); max-height:0;    margin-bottom:0;    } }
    @keyframes __progress { from { width:100%; } to { width:0%; } }
    .__pdf-notif-close:hover { background:rgba(0,0,0,.08) !important; }
    .__pdf-notif-wrap:hover .__pdf-notif-bar { animation-play-state:paused !important; }
  `;
  document.head.appendChild(s);
};

/**
 * Affiche une notification flottante stylisée.
 * @param {{ type?: 'error'|'warning'|'info', title: string, description?: string, isRtl?: boolean }} opts
 */
const _showNotif = ({ type = 'error', title, description = '', isRtl = false }) => {
  _ensureNotifStyles();
  const theme   = _NOTIF_THEMES[type] || _NOTIF_THEMES.error;
  const DURATION = 6000; // ms avant fermeture automatique

  // ── Conteneur principal ──────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = '__pdf-notif-wrap';
  Object.assign(wrap.style, {
    position:      'fixed',
    top:           '24px',
    right:         isRtl ? 'auto' : '24px',
    left:          isRtl ? '24px' : 'auto',
    zIndex:        '99999',
    width:         '360px',
    background:    theme.bg,
    border:        `1px solid ${theme.border}`,
    borderLeft:    isRtl ? `1px solid ${theme.border}` : `4px solid ${theme.accent}`,
    borderRight:   isRtl ? `4px solid ${theme.accent}` : `1px solid ${theme.border}`,
    borderRadius:  '10px',
    boxShadow:     '0 8px 32px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.08)',
    overflow:      'hidden',
    animation:     `__notifIn .35s cubic-bezier(.21,1.02,.73,1) forwards`,
    fontFamily:    `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`,
    direction:     isRtl ? 'rtl' : 'ltr',
    marginBottom:  '10px',
  });

  // ── Corps ────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  Object.assign(body.style, { display:'flex', alignItems:'flex-start', gap:'12px', padding:'16px 14px 14px' });

  // Icône ronde
  const iconWrap = document.createElement('div');
  Object.assign(iconWrap.style, {
    flexShrink:     '0',
    width:          '34px',
    height:         '34px',
    borderRadius:   '50%',
    background:     theme.iconBg,
    color:          '#fff',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      '1px',
  });
  iconWrap.innerHTML = theme.icon;

  // Texte
  const textWrap = document.createElement('div');
  Object.assign(textWrap.style, { flex:'1', minWidth:'0' });

  const titleEl = document.createElement('div');
  Object.assign(titleEl.style, {
    fontWeight:   '600',
    fontSize:     '14px',
    color:        '#1a1a1a',
    lineHeight:   '1.4',
    marginBottom: description ? '5px' : '0',
    textAlign:    isRtl ? 'right' : 'left',
  });
  titleEl.textContent = title;
  textWrap.appendChild(titleEl);

  if (description) {
    const descEl = document.createElement('div');
    Object.assign(descEl.style, {
      fontSize:   '13px',
      color:      '#595959',
      lineHeight: '1.55',
      textAlign:  isRtl ? 'right' : 'left',
    });
    descEl.textContent = description;
    textWrap.appendChild(descEl);
  }

  // Bouton fermer
  const closeBtn = document.createElement('button');
  closeBtn.className = '__pdf-notif-close';
  closeBtn.innerHTML = '&times;';
  Object.assign(closeBtn.style, {
    flexShrink:   '0',
    background:   'transparent',
    border:       'none',
    cursor:       'pointer',
    fontSize:     '20px',
    lineHeight:   '1',
    color:        '#8c8c8c',
    padding:      '2px 4px',
    borderRadius: '4px',
    transition:   'background .15s',
    marginTop:    '-2px',
  });

  body.appendChild(iconWrap);
  body.appendChild(textWrap);
  body.appendChild(closeBtn);
  wrap.appendChild(body);

  // ── Barre de progression ─────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = '__pdf-notif-bar';
  Object.assign(bar.style, {
    height:           '3px',
    background:       theme.accent,
    opacity:          '0.55',
    animation:        `__progress ${DURATION}ms linear forwards`,
    transformOrigin:  isRtl ? 'right' : 'left',
  });
  wrap.appendChild(bar);

  // ── Insertion & fermeture ────────────────────────────────────────────────
  document.body.appendChild(wrap);

  const dismiss = () => {
    wrap.style.animation = '__notifOut .3s ease-in forwards';
    setTimeout(() => wrap.remove(), 320);
  };

  closeBtn.addEventListener('click', dismiss);
  const timer = setTimeout(dismiss, DURATION);
  wrap.addEventListener('mouseenter', () => clearTimeout(timer));
  wrap.addEventListener('mouseleave', () => setTimeout(dismiss, 1500));
};

// ── Messages d'erreur bilingues pour la génération PDF ───────────────────────
const _PDF_TITLES = {
  fr: { error: 'Erreur de génération PDF', warning: 'Document non disponible', info: 'Information' },
  ar: { error: 'خطأ في إنشاء الملف',       warning: 'المستند غير متاح',         info: 'معلومة' },
};

const _PDF_ERROR_MSGS = {
  401:     { type: 'warning',
             fr: "Session expirée. Veuillez vous reconnecter.",
             ar: "انتهت الجلسة. يرجى تسجيل الدخول مجدداً." },
  403:     { type: 'error',
             fr: "Action non autorisée pour ce document ou ce statut.",
             ar: "الإجراء غير مسموح به لهذا المستند أو هذه الحالة." },
  404:     { type: 'warning',
             fr: "Enregistrement introuvable.",
             ar: "السجل غير موجود." },
  400:     { type: 'warning',
             fr: "Impossible de générer ce document (données ou statut invalides).",
             ar: "تعذّر إنشاء المستند (بيانات أو حالة غير صالحة)." },
  500:     { type: 'error',
             fr: "Erreur interne du serveur lors de la génération. Veuillez réessayer ou contacter l'administrateur.",
             ar: "خطأ داخلي في الخادم أثناء الإنشاء. يرجى إعادة المحاولة أو التواصل مع المسؤول." },
  502:     { type: 'error',
             fr: "Le service de génération des actes est momentanément indisponible. Veuillez patienter quelques instants et réessayer.",
             ar: "خدمة إصدار الوثائق غير متاحة حالياً. يرجى الانتظار لحظات ثم إعادة المحاولة." },
  503:     { type: 'error',
             fr: "Le service est en cours de démarrage. Veuillez patienter quelques instants et réessayer.",
             ar: "الخدمة في طور الإقلاع. يرجى الانتظار لحظات ثم إعادة المحاولة." },
  timeout: { type: 'error',
             fr: "La génération du document a dépassé le délai autorisé. Le dossier est peut-être volumineux — réessayez dans quelques instants.",
             ar: "تجاوزت مدة إنشاء الوثيقة الحد المسموح به. الملف قد يكون ضخماً — أعد المحاولة بعد لحظات." },
  unavailable: { type: 'error',
             fr: "Le service de génération des actes est momentanément indisponible. Veuillez réessayer dans quelques instants ou contacter le responsable technique si le problème persiste.",
             ar: "خدمة إصدار الوثائق الرسمية غير متاحة مؤقتاً. يرجى إعادة المحاولة بعد قليل، أو التواصل مع المسؤول التقني إذا استمرت المشكلة." },
  network: { type: 'error',
             fr: "Le service de génération des actes est momentanément indisponible. Veuillez réessayer dans quelques instants ou contacter le responsable technique si le problème persiste.",
             ar: "خدمة إصدار الوثائق الرسمية غير متاحة مؤقتاً. يرجى إعادة المحاولة بعد قليل، أو التواصل مع المسؤول التقني إذا استمرت المشكلة." },
  default: { type: 'error',
             fr: "Erreur technique lors de la génération du document officiel.",
             ar: "خطأ تقني أثناء إنشاء الوثيقة الرسمية." },
};

// ── Cache de disponibilité backend (évite un round-trip par clic PDF) ─────────
let _backendAvailableCache = null; // null = inconnu, true/false = résultat mis en cache
let _backendCacheExpiry    = 0;    // timestamp d'expiration du cache (ms)
const _BACKEND_CACHE_TTL   = 30_000; // 30 secondes

/**
 * Vérifie rapidement si le backend est joignable via /api/health/.
 * Résultat mis en cache 30s pour ne pas ralentir les clics répétés.
 */
const _checkBackendAvailable = async () => {
  const now = Date.now();
  if (_backendAvailableCache !== null && now < _backendCacheExpiry) {
    return _backendAvailableCache;
  }
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 4000); // 4s max pour la sonde
    const resp = await fetch(`${API_HOST}/api/health/`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    _backendAvailableCache = resp.ok;
  } catch (_) {
    _backendAvailableCache = false;
  }
  _backendCacheExpiry = Date.now() + _BACKEND_CACHE_TTL;
  return _backendAvailableCache;
};

/** Invalide le cache (appelé après une erreur réseau pour forcer une nouvelle sonde) */
export const invalidateBackendCache = () => {
  _backendAvailableCache = null;
  _backendCacheExpiry    = 0;
};

// ── Télécharger un PDF avec le token JWT (window.open ne transmet pas le token)
export const openPDF = async (path) => {
  const token = localStorage.getItem('access_token');
  const lang  = localStorage.getItem('lang') || 'fr';
  const isAr  = lang === 'ar';
  const isRtl = isAr;

  // CORRECTION CRITIQUE : ne jamais utiliser localhost en fallback.
  // En production, API_HOST est '' → l'URL devient relative (/api/...)
  // ce qui passe par le proxy Express (même origin, pas de CORS).
  // En développement, API_HOST = 'http://localhost:8000' via REACT_APP_API_URL.
  const url = path.startsWith('http') ? path : `${API_HOST}${path}`;

  /** Affiche la notification d'erreur adaptée */
  const showError = (httpKey, serverDetail = '') => {
    const entry   = _PDF_ERROR_MSGS[httpKey] || _PDF_ERROR_MSGS.default;
    const notifType  = entry.type;
    const fallback   = isAr ? entry.ar : entry.fr;
    const titles     = _PDF_TITLES[isAr ? 'ar' : 'fr'];
    const titleText  = titles[notifType] || titles.error;
    _showNotif({ type: notifType, title: titleText, description: serverDetail || fallback, isRtl });
  };

  // ── 1. Vérification de disponibilité avant toute tentative ───────────────────
  const available = await _checkBackendAvailable();
  if (!available) {
    invalidateBackendCache(); // prochaine tentative refait la sonde
    showError('unavailable');
    return;
  }

  // ── 2. Requête PDF avec timeout explicite ────────────────────────────────────
  const controller = new AbortController();
  // Timeout généreux : les PDF volumineux (registre chronologique, attestations avec QR)
  // peuvent nécessiter jusqu'à 90 secondes sur Railway en phase de test.
  const timeoutId  = setTimeout(() => controller.abort(), 90_000);

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      // Après une erreur serveur, invalider le cache pour forcer une nouvelle sonde
      if (resp.status >= 500) invalidateBackendCache();

      let serverDetail = '';
      try {
        const json   = await resp.json();
        serverDetail = (isAr ? (json.detail_ar || json.detail) : json.detail) || '';
      } catch (_) { /* réponse non-JSON (ex. page HTML d'erreur proxy) */ }

      showError(resp.status, serverDetail);
      return;
    }

    // Extraire le nom de fichier depuis Content-Disposition, ou dériver de l'URL
    const disposition = resp.headers.get('Content-Disposition') || '';
    const match       = disposition.match(/filename="?([^";\r\n]+)"?/i);
    let filename      = match ? match[1].trim() : '';
    if (!filename) {
      const seg = url.split('?')[0].split('/').filter(Boolean).pop() || 'document';
      filename  = seg.endsWith('.pdf') ? seg : `${seg}.pdf`;
    }

    const blob    = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);

  } catch (e) {
    clearTimeout(timeoutId);
    invalidateBackendCache();

    if (e.name === 'AbortError') {
      console.warn('[PDF] Timeout dépassé (90s) :', url);
      showError('timeout');
    } else {
      console.error('[PDF] Erreur réseau :', e.message, url);
      showError('network');
    }
  }
};

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Injecter le token JWT dans chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Intercepteur HTTP 503 : schéma DB désynchronisé ─────────────────────────
// Affiche un bandeau bloquant non dismissible si le backend retourne 503
// avec le code MIGRATIONS_PENDING. Cela se produit quand des migrations
// Django n'ont pas été appliquées avant le démarrage du serveur.
const _show503Banner = (() => {
  let _shown = false;
  return (data) => {
    if (_shown) return;
    _shown = true;
    const lang  = localStorage.getItem('lang') || 'fr';
    const isAr  = lang === 'ar';
    const msg   = isAr
      ? (data?.detail_ar || 'نظام السجل التجاري محجوب: ترحيلات DB في انتظار التطبيق.')
      : (data?.detail   || 'Le système RCCM est bloqué : des migrations DB sont en attente.');
    const hint  = data?.hint  || 'python manage.py migrate';
    const pending = (data?.pending || []).slice(0, 5);

    // Bandeau rouge plein écran, non dismissible, priorité maximale
    const banner = document.createElement('div');
    banner.id = '__rccm-503-banner';
    Object.assign(banner.style, {
      position:        'fixed',
      top:             '0',
      left:            '0',
      right:           '0',
      bottom:          '0',
      background:      'rgba(0,0,0,0.85)',
      zIndex:          '999999',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      fontFamily:      'system-ui, sans-serif',
      direction:       isAr ? 'rtl' : 'ltr',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      background:   '#fff',
      borderRadius: '10px',
      padding:      '32px 40px',
      maxWidth:     '560px',
      width:        '90%',
      boxShadow:    '0 20px 60px rgba(0,0,0,0.4)',
      borderTop:    '5px solid #ff4d4f',
      textAlign:    isAr ? 'right' : 'left',
    });

    const pendingHtml = pending.length
      ? `<ul style="margin:8px 0 0;padding-${isAr?'right':'left'}:20px;font-size:13px;color:#595959;">
           ${pending.map(m => `<li style="margin:3px 0;">${m}</li>`).join('')}
         </ul>`
      : '';

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <span style="font-size:28px;">⛔</span>
        <span style="font-size:18px;font-weight:700;color:#ff4d4f;">
          ${isAr ? 'النظام موقوف مؤقتاً' : 'Système temporairement bloqué'}
        </span>
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:#262626;line-height:1.6;">${msg}</p>
      ${pendingHtml}
      <div style="margin-top:20px;background:#fff2f0;border:1px solid #ffccc7;
                  border-radius:6px;padding:12px 16px;">
        <div style="font-size:12px;color:#8c8c8c;margin-bottom:4px;">
          ${isAr ? 'الأمر اللازم لتصحيح الوضع:' : 'Commande de correction :'}
        </div>
        <code style="font-size:13px;color:#a61d24;font-family:monospace;">${hint}</code>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#8c8c8c;">
        ${isAr
          ? 'أعد تشغيل الخادم بعد تطبيق الترحيلات.'
          : 'Redémarrez le serveur après avoir appliqué les migrations.'}
      </p>
    `;

    banner.appendChild(card);
    document.body.appendChild(banner);
  };
})();

// Gestion automatique du refresh token + garde 503
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ── 503 Migrations en attente : bandeau bloquant global ──────────────────
    if (error.response?.status === 503) {
      const data = error.response?.data;
      if (data?.code === 'MIGRATIONS_PENDING') {
        _show503Banner(data);
        return Promise.reject(error);
      }
    }

    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login/', data),
  logout:         (refresh) => api.post('/auth/logout/', { refresh }),
  me:             () => api.get('/auth/me/'),
  changePassword: (data) => api.post('/auth/change-password/', data),
};

// ── Paramétrage ──────────────────────────────────────────────────────────────
export const parametrageAPI = {
  nationalites:        (params) => api.get('/parametrage/nationalites/', { params }),
  createNationalite:   (data)   => api.post('/parametrage/nationalites/', data),
  updateNationalite:   (id, d)  => api.put(`/parametrage/nationalites/${id}/`, d),
  importNationalites:  (formData) => api.post('/parametrage/nationalites/import/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  formesJuridiques:        (params) => api.get('/parametrage/formes-juridiques/', { params }),
  createFormeJuridique:    (data)   => api.post('/parametrage/formes-juridiques/', data),
  updateFormeJuridique:    (id, d)  => api.put(`/parametrage/formes-juridiques/${id}/`, d),

  domaines:        (params) => api.get('/parametrage/domaines-activites/', { params }),
  createDomaine:   (data)   => api.post('/parametrage/domaines-activites/', data),
  updateDomaine:   (id, d)  => api.put(`/parametrage/domaines-activites/${id}/`, d),

  fonctions:        (params) => api.get('/parametrage/fonctions/', { params }),
  createFonction:   (data)   => api.post('/parametrage/fonctions/', data),
  updateFonction:   (id, d)  => api.put(`/parametrage/fonctions/${id}/`, d),

  typesDocuments:        (params) => api.get('/parametrage/types-documents/', { params }),
  createTypeDocument:    (data)   => api.post('/parametrage/types-documents/', data),
  updateTypeDocument:    (id, d)  => api.put(`/parametrage/types-documents/${id}/`, d),

  typesDemandes:    (params) => api.get('/parametrage/types-demandes/', { params }),
  localites:        (params) => api.get('/parametrage/localites/', { params }),
  createLocalite:   (data)   => api.post('/parametrage/localites/', data),
  updateLocalite:   (id, d)  => api.put(`/parametrage/localites/${id}/`, d),

  tarifs: () => api.get('/parametrage/tarifs/'),

  // Signataires
  signataires:       ()       => api.get('/parametrage/signataires/'),
  createSignataire:  (data)   => api.post('/parametrage/signataires/', data),
  updateSignataire:  (id, d)  => api.put(`/parametrage/signataires/${id}/`, d),
  deleteSignataire:  (id)     => api.delete(`/parametrage/signataires/${id}/`),

  // Numérotation
  numerotation:       ()          => api.get('/parametrage/numerotation/'),
  updateNumerotation: (code, d)   => api.put(`/parametrage/numerotation/${code}/`, d),
};

// ── Personnes Physiques ──────────────────────────────────────────────────────
export const phAPI = {
  list:   (params) => api.get('/personnes-physiques/', { params }),
  get:    (id)     => api.get(`/personnes-physiques/${id}/`),
  create: (data)   => api.post('/personnes-physiques/', data),
  update: (id, d)  => api.put(`/personnes-physiques/${id}/`, d),
  delete: (id)     => api.delete(`/personnes-physiques/${id}/`),
};

// ── Personnes Morales ─────────────────────────────────────────────────────────
export const pmAPI = {
  list:         (params) => api.get('/personnes-morales/', { params }),
  get:          (id)     => api.get(`/personnes-morales/${id}/`),
  create:       (data)   => api.post('/personnes-morales/', data),
  update:       (id, d)  => api.put(`/personnes-morales/${id}/`, d),
  delete:       (id)     => api.delete(`/personnes-morales/${id}/`),
  getAssocies:  (id)     => api.get(`/personnes-morales/${id}/associes/`),
  getGerants:   (id)     => api.get(`/personnes-morales/${id}/gerants/`),
};

// ── Succursales ───────────────────────────────────────────────────────────────
export const scAPI = {
  list:   (params) => api.get('/succursales/', { params }),
  get:    (id)     => api.get(`/succursales/${id}/`),
  create: (data)   => api.post('/succursales/', data),
  update: (id, d)  => api.put(`/succursales/${id}/`, d),
};

// ── Registres ─────────────────────────────────────────────────────────────────
export const registreAPI = {
  // Analytique
  listRA:    (params) => api.get('/registres/analytique/', { params }),
  getRA:     (id)     => api.get(`/registres/analytique/${id}/`),
  createRA:  (data)   => api.post('/registres/analytique/', data),
  updateRA:  (id, d)  => api.patch(`/registres/analytique/${id}/`, d),

  // Workflow
  validerRA:  (id, d)  => api.patch(`/registres/analytique/${id}/valider/`,  d || {}),
  envoyerRA:  (id, d)  => api.patch(`/registres/analytique/${id}/envoyer/`,  d || {}),
  retournerRA:(id, d)  => api.patch(`/registres/analytique/${id}/retourner/`, d || {}),
  historiqueRA:(id)    => api.get(`/registres/analytique/${id}/historique/`),
  declarerBE:  (id)    => api.patch(`/registres/analytique/${id}/declarer-be/`),

  // Chronologique
  listChrono:    (params) => api.get('/registres/chronologique/', { params }),
  getChrono:     (id)     => api.get(`/registres/chronologique/${id}/`),
  createChrono:  (data)   => api.post('/registres/chronologique/', data),
  validerChrono: (id)     => api.patch(`/registres/chronologique/${id}/valider/`),
  envoyerChrono: (id)     => api.patch(`/registres/chronologique/${id}/envoyer/`),
  retournerChrono:(id, d) => api.patch(`/registres/chronologique/${id}/retourner/`, d || {}),
  rectifierChrono:(id, d) => api.patch(`/registres/chronologique/${id}/rectifier/`, d),

  // Enregistrement initial
  enregistrementInitial: (data) => api.post('/registres/enregistrement-initial/', data),

  // Vérification doublon temps réel
  checkDoublon: (params) => api.get('/registres/check-doublon/', { params }),

  // Recherche de déclarants (auto-complétion)
  declarantSearch: (q, field = 'nom') => api.get('/registres/declarants/', { params: { q, field } }),
};

// ── Registre des Bénéficiaires Effectifs (RBE) ───────────────────────────────
export const rbeAPI = {
  // Entités juridiques
  listEntites:        (p)         => api.get('/rbe/entites/', { params: p }),
  getEntite:          (id)        => api.get(`/rbe/entites/${id}/`),
  createEntite:       (d)         => api.post('/rbe/entites/', d),
  updateEntite:       (id, d)     => api.patch(`/rbe/entites/${id}/`, d),

  // Déclarations RBE
  list:               (p)         => api.get('/rbe/', { params: p }),
  get:                (id)        => api.get(`/rbe/${id}/`),
  create:             (d)         => api.post('/rbe/', d),
  update:             (id, d)     => api.patch(`/rbe/${id}/`, d),
  envoyer:            (id)        => api.patch(`/rbe/${id}/envoyer/`),
  valider:            (id, d)     => api.patch(`/rbe/${id}/valider/`, d || {}),
  retourner:          (id, d)     => api.patch(`/rbe/${id}/retourner/`, d),
  radier:             (id, d)     => api.post(`/rbe/${id}/radier/`, d),
  modifier:           (id, d)     => api.post(`/rbe/${id}/modifier/`, d),
  historique:         (id)        => api.get(`/rbe/${id}/historique/`),
  listBeneficiaires:  (id)        => api.get(`/rbe/${id}/beneficiaires/`),
  addBeneficiaire:    (id, d)     => api.post(`/rbe/${id}/beneficiaires/`, d),
  updateBeneficiaire: (id, bid, d)=> api.patch(`/rbe/${id}/beneficiaires/${bid}/`, d),
  deleteBeneficiaire: (id, bid)   => api.delete(`/rbe/${id}/beneficiaires/${bid}/`),
  recherche:          (p)         => api.get('/rbe/recherche/', { params: p }),
  reporting:          ()          => api.get('/rbe/reporting/'),
};

// ── Demandes ──────────────────────────────────────────────────────────────────
export const demandeAPI = {
  list:      (params) => api.get('/demandes/', { params }),
  get:       (id)     => api.get(`/demandes/${id}/`),
  create:    (data)   => api.post('/demandes/', data),
  update:    (id, d)  => api.patch(`/demandes/${id}/`, d),
  soumettre: (id)     => api.patch(`/demandes/${id}/soumettre/`),
  valider:   (id)     => api.patch(`/demandes/${id}/valider/`),
  rejeter:   (id, m)  => api.patch(`/demandes/${id}/rejeter/`, { motif_rejet: m }),
  annuler:   (id)     => api.patch(`/demandes/${id}/annuler/`),
  stats:     ()       => api.get('/demandes/stats/'),
};

// ── Dépôts ────────────────────────────────────────────────────────────────────
export const depotAPI = {
  list:       (params) => api.get('/depots/',               { params }),
  get:        (id)     => api.get(`/depots/${id}/`),
  create:     (data)   => api.post('/depots/', data),
  update:     (id, data) => api.patch(`/depots/${id}/`, data),
  certificat: (id, lang='fr') => `${BASE_URL}/depots/${id}/certificat/?lang=${lang}`,
};

// ── Modifications ─────────────────────────────────────────────────────────────
export const modifAPI = {
  list:               (params)   => api.get('/modifications/',                    { params }),
  get:                (id)       => api.get(`/modifications/${id}/`),
  create:             (data)     => api.post('/modifications/', data),
  update:             (id, data) => api.patch(`/modifications/${id}/`, data),
  lookup:             (params)   => api.get('/modifications/lookup/',             { params }),
  soumettre:          (id)       => api.patch(`/modifications/${id}/soumettre/`),
  retourner:          (id, data) => api.patch(`/modifications/${id}/retourner/`, data),
  valider:            (id, data) => api.patch(`/modifications/${id}/valider/`, data),
  annuler:            (id)       => api.patch(`/modifications/${id}/annuler/`),
  annulerValide:      (id)       => api.patch(`/modifications/${id}/annuler-valide/`),
  modifierCorrectif:  (id, data) => api.patch(`/modifications/${id}/modifier-correctif/`, data),
  // Données RA d'une modification existante (sans vérification BE — pour édition directe)
  raData:             (id)       => api.get(`/modifications/${id}/ra-data/`),
};

// ── Radiations ────────────────────────────────────────────────────────────────
export const radiationAPI = {
  list:    (params) => api.get('/radiations/', { params }),
  get:     (id)     => api.get(`/radiations/${id}/`),
  create:  (data)   => api.post('/radiations/', data),
  lookup:  (params) => api.get('/radiations/lookup/', { params }),
  valider: (id)     => api.patch(`/radiations/${id}/valider/`),
  rejeter: (id)     => api.patch(`/radiations/${id}/rejeter/`),
  annuler:           (id)       => api.patch(`/radiations/${id}/annuler/`),
  annulerValidation: (id, data) => api.patch(`/radiations/${id}/annuler-validation/`, data),
};

// ── Cessions ──────────────────────────────────────────────────────────────────
export const cessionAPI = {
  list:               (params)   => api.get('/cessions/',                        { params }),
  get:                (id)       => api.get(`/cessions/${id}/`),
  create:             (data)     => api.post('/cessions/', data),
  update:             (id, data) => api.patch(`/cessions/${id}/`, data),
  lookup:             (params)   => api.get('/cessions/lookup/',                 { params }),
  soumettre:          (id)       => api.patch(`/cessions/${id}/soumettre/`),
  retourner:          (id, data) => api.patch(`/cessions/${id}/retourner/`, data),
  valider:            (id, data) => api.patch(`/cessions/${id}/valider/`, data),
  annuler:            (id)       => api.patch(`/cessions/${id}/annuler/`),
  annulerValide:      (id)       => api.patch(`/cessions/${id}/annuler-valide/`),
  modifierCorrectif:  (id, data) => api.patch(`/cessions/${id}/modifier-correctif/`, data),
};

// ── Cessions de fonds de commerce ─────────────────────────────────────────────
export const cessionsFondsAPI = {
  list:               (params)   => api.get('/cessions-fonds/',                    { params }),
  get:                (id)       => api.get(`/cessions-fonds/${id}/`),
  create:             (data)     => api.post('/cessions-fonds/', data),
  update:             (id, data) => api.patch(`/cessions-fonds/${id}/`, data),
  lookup:             (params)   => api.get('/cessions-fonds/lookup/',             { params }),
  soumettre:          (id)       => api.patch(`/cessions-fonds/${id}/soumettre/`),
  retourner:          (id, data) => api.patch(`/cessions-fonds/${id}/retourner/`, data),
  valider:            (id, data) => api.patch(`/cessions-fonds/${id}/valider/`, data),
  annuler:            (id)       => api.patch(`/cessions-fonds/${id}/annuler/`),
  annulerValide:      (id)       => api.patch(`/cessions-fonds/${id}/annuler-valide/`),
  modifierCorrectif:  (id, data) => api.patch(`/cessions-fonds/${id}/modifier-correctif/`, data),
  certificat:         (id)            => `${BASE_URL}/rapports/certificat-cession-fonds/${id}/`,
};

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentAPI = {
  list:     (params) => api.get('/documents/', { params }),
  /**
   * Upload multipart/form-data.
   * On NE fixe PAS Content-Type manuellement : axios (+ XHR du navigateur)
   * détecte automatiquement FormData et ajoute le boundary correct.
   * Forcer 'multipart/form-data' sans boundary empêche Django de parser le corps.
   */
  upload:   (data)   => api.post('/documents/', data, {
    headers: { 'Content-Type': undefined },   // supprime le défaut 'application/json'
  }),
  download: (id)     => `${BASE_URL}/documents/${id}/download/`,  // Content-Disposition: attachment
  view:     (id)     => `${BASE_URL}/documents/${id}/view/`,      // Content-Disposition: inline
  delete:   (id)     => api.delete(`/documents/${id}/`),
};

/**
 * Ouvre un document (PDF, image…) en visualisation inline dans un nouvel onglet.
 * Utilise le mécanisme blob-URL pour transmettre le JWT sans l'exposer dans l'URL.
 *
 * Comportement par type MIME :
 *   PDF          → onglet avec visionneuse PDF intégrée du navigateur
 *   Image        → onglet avec affichage direct
 *   Word / autre → téléchargement déclenché automatiquement par le navigateur
 */
export const viewDocument = async (path) => {
  const token = localStorage.getItem('access_token');
  const lang  = localStorage.getItem('lang') || 'fr';
  const isAr  = lang === 'ar';
  const url   = path.startsWith('http') ? path : `${API_HOST || 'http://localhost:8000'}${path}`;

  // Ouvrir la fenêtre cible immédiatement (événement utilisateur synchrone)
  // pour éviter que le bloqueur de pop-ups ne l'intercepte.
  const targetWin = window.open('', '_blank');

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      targetWin && targetWin.close();
      let serverDetail = '';
      try {
        const json   = await resp.json();
        serverDetail = (isAr ? (json.detail_ar || json.detail) : json.detail) || '';
      } catch (_) {}
      const _PDF_ERROR_MSGS_LOCAL = {
        401: { fr: "Session expirée. Veuillez vous reconnecter.",         ar: "انتهت الجلسة. يرجى تسجيل الدخول مجدداً." },
        403: { fr: "Action non autorisée pour ce document.",              ar: "الإجراء غير مسموح به لهذا المستند." },
        404: { fr: "Fichier introuvable sur le serveur.",                 ar: "الملف غير موجود على الخادم." },
        500: { fr: "Erreur interne du serveur.",                          ar: "خطأ داخلي في الخادم." },
      };
      const entry   = _PDF_ERROR_MSGS_LOCAL[resp.status] || { fr: "Erreur lors de l'ouverture du fichier.", ar: "خطأ أثناء فتح الملف." };
      const fallback = isAr ? entry.ar : entry.fr;
      _showNotif({ type: 'error',
        title:       isAr ? 'خطأ في عرض الملف'          : 'Erreur de visualisation',
        description: serverDetail || fallback,
        isRtl:       isAr });
      return;
    }

    const blob    = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    // Rediriger l'onglet déjà ouvert vers le blob
    if (targetWin && !targetWin.closed) {
      targetWin.location.href = blobUrl;
    } else {
      // Fallback si le pop-up a été bloqué malgré la précaution
      const a = document.createElement('a');
      a.href   = blobUrl;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Libérer la mémoire après que le navigateur a chargé le document
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

  } catch (e) {
    targetWin && targetWin.close();
    console.error('Erreur viewDocument:', e);
    _showNotif({ type: 'error',
      title:       isAr ? 'تعذّر فتح الملف'                           : 'Impossible d\'ouvrir le fichier',
      description: isAr ? 'تعذّر الاتصال بالخادم. تأكد من تشغيل الخدمة.' : 'Impossible de joindre le serveur. Vérifiez que le backend est démarré.',
      isRtl:       isAr });
  }
};

// ── Rapports ──────────────────────────────────────────────────────────────────
export const rapportAPI = {
  tableauDeBord:              ()       => api.get('/rapports/tableau-de-bord/'),
  statistiques:               (params) => api.get('/rapports/statistiques/', { params }),
  // ── Règle RCCM : la langue est exclusivement déterminée par le champ langue_acte
  //    persisté sur l'acte (backend). Le frontend ne passe AUCUN ?lang= — le paramètre
  //    serait ignoré. Cela garantit qu'un acte arabe produit toujours un PDF arabe.
  attestationImmatriculation: (raId)    => `${BASE_URL}/rapports/attestation-immatriculation/${raId}/`,
  extraitRC:                  (raId)    => `${BASE_URL}/rapports/extrait-rc/${raId}/`,
  certificatChronologique:    (rcId)    => `${BASE_URL}/rapports/certificat-chronologique/${rcId}/`,
  registreChronologiquePDF:   (params)  => `${BASE_URL}/rapports/registre-chronologique/?${new URLSearchParams(params)}`,
  attestationRBE:             (id, lang='fr') => `${BASE_URL}/rapports/attestation-rbe/${id}/?lang=${lang}`,
  extraitRBE:                 (id, lang='fr') => `${BASE_URL}/rapports/extrait-rbe/${id}/?lang=${lang}`,
  certificatRadiation:        (radId)   => `${BASE_URL}/rapports/certificat-radiation/${radId}/`,
  certificatModification:     (modifId) => `${BASE_URL}/rapports/certificat-modification/${modifId}/`,
  certificatCession:          (cesId)   => `${BASE_URL}/rapports/certificat-cession-parts/${cesId}/`,
};

// ── Recherche ─────────────────────────────────────────────────────────────────
export const rechercheAPI = {
  global:            (q)      => api.get('/recherche/', { params: { q } }),
  avancee:           (params) => api.get('/recherche/avancee/', { params }),
  parNNI:            (nni)    => api.get(`/recherche/nni/${nni}/`),
  parNumRC:          (rc)     => api.get(`/recherche/rc/${rc}/`),
  certificatNegatif: (d)      => api.get('/recherche/certificat-negatif/', { params: { denomination: d } }),
};

// ── Utilisateurs ──────────────────────────────────────────────────────────────
export const utilisateurAPI = {
  list:          (params) => api.get('/utilisateurs/', { params }),
  roles:         () => api.get('/utilisateurs/roles/'),
  get:           (id)    => api.get(`/utilisateurs/${id}/`),
  create:        (data)  => api.post('/utilisateurs/', data),
  update:        (id, d) => api.put(`/utilisateurs/${id}/`, d),
  activer:       (id)    => api.patch(`/utilisateurs/${id}/activer/`),
  desactiver:    (id)    => api.patch(`/utilisateurs/${id}/desactiver/`),
  resetPassword: (id, p) => api.patch(`/utilisateurs/${id}/reset-password/`, { nouveau_mdp: p }),
};

// ── Journal d'audit ───────────────────────────────────────────────────────────
export const journalAPI = {
  list: (params) => api.get('/registres/journal/', { params }),
};

// ── Immatriculations historiques ──────────────────────────────────────────────
export const historiqueAPI = {
  list:      (params)    => api.get('/historique/',                   { params }),
  get:       (id)        => api.get(`/historique/${id}/`),
  create:    (data)      => api.post('/historique/', data),
  update:    (id, data)  => api.patch(`/historique/${id}/`, data),
  soumettre: (id)        => api.patch(`/historique/${id}/soumettre/`),
  retourner: (id, data)  => api.patch(`/historique/${id}/retourner/`, data),
  valider:   (id, data)  => api.patch(`/historique/${id}/valider/`,   data || {}),
  rejeter:   (id, data)  => api.patch(`/historique/${id}/rejeter/`,   data),
  annuler:   (id)        => api.patch(`/historique/${id}/annuler/`),
  import:    (fd)        => api.post('/historique/import/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// ── Demandes d'autorisation (impression / correction post-validation) ─────────
export const autorisationAPI = {
  list:      (params)        => api.get('/autorisations/', { params }),
  get:       (id)            => api.get(`/autorisations/${id}/`),
  create:    (data)          => api.post('/autorisations/', data),
  verifier:  (params)        => api.get('/autorisations/verifier/', { params }),
  autoriser: (id, data = {}) => api.post(`/autorisations/${id}/autoriser/`, data),
  refuser:   (id, data = {}) => api.post(`/autorisations/${id}/refuser/`, data),
};

// ── Certificats greffier (non faillite, non litige, etc.) ────────────────────
export const certificatsAPI = {
  list:          (params)        => api.get('/certificats/', { params }),
  get:           (id)            => api.get(`/certificats/${id}/`),
  create:        (data)          => api.post('/certificats/', data),
  pdf:           (id, lang='fr') => `${BASE_URL}/certificats/${id}/pdf/?lang=${lang}`,
  searchEntite:  (q)             => api.get('/certificats/search-entite/', { params: { q } }),
};

export default api;

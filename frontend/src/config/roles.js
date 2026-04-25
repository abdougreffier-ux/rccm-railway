/**
 * Matrice centralisée rôle → landing / redirect
 * ================================================
 * SOURCE UNIQUE DE VÉRITÉ utilisée par :
 *   - Login.jsx             (redirect post-connexion)
 *   - App.jsx               (GreffierRoute / TribunalRoute / PrivateRoute)
 *   - Sidebar.jsx           (filtrage menu)
 *   - Dashboard.jsx         (contenu adapté au rôle)
 *
 * Toute modification de règle d'accès doit passer par ce fichier.
 * Les noms des constantes sont identiques côté backend (core/permissions.py).
 */

// ── Codes de rôle ─────────────────────────────────────────────────────────────
export const ROLE = {
  GREFFIER:       'GREFFIER',
  AGENT_TRIBUNAL: 'AGENT_TRIBUNAL',
  AGENT_GU:       'AGENT_GU',
};

// ── Page d'atterrissage par rôle ──────────────────────────────────────────────
export const LANDING = {
  [ROLE.GREFFIER]:       '/',                        // Tableau de bord complet
  [ROLE.AGENT_TRIBUNAL]: '/modifications',            // Page de travail principale
  [ROLE.AGENT_GU]:       '/registres/chronologique', // Seule tâche autorisée
  default:               '/registres/chronologique', // Fallback sécurisé
};

/**
 * Retourne la page d'atterrissage d'un utilisateur.
 * @param {object|null} user — objet provenant de AuthContext
 * @returns {string} chemin React Router
 */
export const getLanding = (user) => {
  if (!user) return '/login';
  const code = user?.role?.code;
  // Superuser Django → traité comme GREFFIER
  if (!code && user?.is_superuser) return LANDING[ROLE.GREFFIER];
  return LANDING[code] ?? LANDING.default;
};

// ── Groupes de rôles pour les guards de route ─────────────────────────────────
export const ROLE_GROUP = {
  /** Tout le personnel (greffier + agents) */
  ALL_STAFF:     [ROLE.GREFFIER, ROLE.AGENT_TRIBUNAL, ROLE.AGENT_GU],
  /** Greffier + agent tribunal uniquement (pas agent GU) */
  TRIBUNAL_ONLY: [ROLE.GREFFIER, ROLE.AGENT_TRIBUNAL],
  /** Greffier exclusivement */
  GREFFIER_ONLY: [ROLE.GREFFIER],
};

/**
 * Vérifie si un objet user a accès à un groupe de rôles.
 * Compatible avec hasRole() d'AuthContext.
 * @param {object|null} user
 * @param {string[]}    requiredRoles
 * @returns {boolean}
 */
export const userHasAccess = (user, requiredRoles) => {
  if (!user) return false;
  // Superuser Django → accès complet (identique à get_role() backend)
  if (user.is_superuser) return true;
  const code = user?.role?.code;
  return !!code && requiredRoles.includes(code);
};

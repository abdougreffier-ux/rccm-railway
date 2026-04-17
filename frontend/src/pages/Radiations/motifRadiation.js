/**
 * motifRadiation.js — Traductions bilingues des motifs de radiation RCCM.
 *
 * Règle RCCM : tous les libellés affichés à l'utilisateur doivent respecter
 * la langue de l'interface active (FR ou AR), sans exception.
 *
 * Les clés métier (codes internes) ne sont JAMAIS modifiées.
 * Seul le libellé affiché dépend de la langue.
 */

/** Table de traduction : code → { fr, ar } */
export const MOTIF_LABELS = {
  CESSATION:   { fr: "Cessation d'activités", ar: 'توقف النشاط' },
  DISSOLUTION: { fr: 'Dissolution',           ar: 'الحل'         },
  LIQUIDATION: { fr: 'Liquidation',           ar: 'التصفية'      },
  FAILLITE:    { fr: 'Faillite',              ar: 'الإفلاس'      },
  FUSION:      { fr: 'Fusion',               ar: 'الاندماج'     },
  AUTRE:       { fr: 'Autre',                ar: 'آخر'          },
};

/**
 * Retourne le libellé traduit d'un motif.
 * @param {string} code  - Code métier (ex. 'CESSATION')
 * @param {boolean} isAr - true si l'interface est en arabe
 * @returns {string}     - Libellé dans la langue active, ou le code brut en fallback
 */
export function getMotifLabel(code, isAr) {
  if (!code) return '—';
  const entry = MOTIF_LABELS[code];
  if (!entry) return code;
  return isAr ? entry.ar : entry.fr;
}

/**
 * Retourne le tableau d'options Select pour Ant Design,
 * dans la langue active.
 * @param {boolean} isAr - true si l'interface est en arabe
 * @returns {{ value: string, label: string }[]}
 */
export function getMotifOptions(isAr) {
  return Object.entries(MOTIF_LABELS).map(([value, labels]) => ({
    value,
    label: isAr ? labels.ar : labels.fr,
  }));
}

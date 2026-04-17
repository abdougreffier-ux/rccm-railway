/**
 * Utilitaire centralisé — Civilité RCCM
 *
 * Valeurs normalisées (stockées en base) :  MR | MME | MLLE
 * Libellés FR :  M. / Mme / Mlle
 * Libellés AR :  السيد / السيدة / الآنسة
 *
 * Usage dans un formulaire :
 *   import { getCiviliteOptions } from '../../utils/civilite';
 *   <Select options={getCiviliteOptions(lang)} />
 *
 * Usage dans un affichage (tableau, fiche) :
 *   import { formatCivilite } from '../../utils/civilite';
 *   const civ = formatCivilite(record.civilite, isAr ? 'ar' : 'fr');
 */

/** Carte complète des libellés par code et par langue */
export const CIVILITE_MAP = {
  MR:   { fr: 'M.',    ar: 'السيد'  },
  MME:  { fr: 'Mme',   ar: 'السيدة' },
  MLLE: { fr: 'Mlle',  ar: 'الآنسة' },
};

/**
 * Retourne les options Select localisées pour le champ civilité.
 * @param {string} lang - 'fr' (défaut) ou 'ar'
 * @returns {Array<{value: string, label: string}>}
 */
export function getCiviliteOptions(lang = 'fr') {
  return Object.entries(CIVILITE_MAP).map(([value, labels]) => ({
    value,
    label: labels[lang] ?? labels.fr,
  }));
}

/**
 * Formate un code civilité en libellé localisé.
 * Retourne '' si le code est inconnu ou absent (ne jamais afficher le code brut).
 * @param {string} code  - 'MR', 'MME' ou 'MLLE'
 * @param {string} lang  - 'fr' (défaut) ou 'ar'
 * @returns {string}
 */
export function formatCivilite(code, lang = 'fr') {
  return CIVILITE_MAP[code]?.[lang] ?? CIVILITE_MAP[code]?.fr ?? '';
}

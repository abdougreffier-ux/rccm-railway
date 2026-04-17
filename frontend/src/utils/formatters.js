/**
 * Formate un numéro d'enregistrement chronologique sur 4 chiffres minimum,
 * complété par des zéros à gauche (ex: 1 → '0001', 25 → '0025', 10000 → '10000').
 * Les valeurs déjà normalisées (ex: '0001') restent inchangées.
 */
export const fmtChrono = (val) => {
  if (val == null || val === '') return '—';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return String(val);
  const n = parseInt(digits, 10);
  if (isNaN(n)) return String(val);
  return String(n).padStart(4, '0');
};

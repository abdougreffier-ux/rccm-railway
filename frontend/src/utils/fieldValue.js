/**
 * fieldValue(obj, key, isAr)
 *
 * Retourne la valeur la plus appropriée selon la langue :
 *
 *  Mode AR : obj[key_ar]  →  obj[key]  →  obj[key_fr]  →  ''
 *  Mode FR : obj[key]     →  obj[key_fr]  →  ''
 *
 * Compatible avec :
 *  - Les réponses API Django (alias `libelle` = `libelle_fr` + `libelle_ar`)
 *  - Les données locales (ex: PAYS avec uniquement `libelle_fr` / `libelle_ar`)
 *  - Les objets nuls ou undefined (retourne '' sans erreur)
 *
 * @param {object|null|undefined} obj   L'objet source
 * @param {string}                key   Le nom de base du champ (ex: 'libelle', 'denomination', 'nom')
 * @param {boolean}               isAr  true si la langue courante est l'arabe
 * @returns {string}
 */
const isNonEmpty = (v) => v !== undefined && v !== null && v !== '';

const fieldValue = (obj, key, isAr = false) => {
  if (!obj) return '';

  if (isAr) {
    const arVal = obj[`${key}_ar`];
    if (isNonEmpty(arVal)) return arVal;
  }

  const directVal = obj[key];
  if (isNonEmpty(directVal)) return String(directVal);

  // Fallback _fr pour les données locales (PAYS, etc.) qui n'ont pas d'alias
  const frVal = obj[`${key}_fr`];
  if (isNonEmpty(frVal)) return String(frVal);

  return '';
};

export default fieldValue;

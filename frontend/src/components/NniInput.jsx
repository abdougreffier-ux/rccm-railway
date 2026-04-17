import React from 'react';
import { Input } from 'antd';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Champ NNI — filtre les non-chiffres en temps réel et limite à 10 caractères.
 *
 * Compatible avec :
 *  - Ant Design Form.Item  (reçoit value/onChange de Form)
 *  - Composants contrôlés inline  (onChange = e => u('nni', e.target.value))
 *
 * Pour la validation, utiliser nniRule(t) dans les `rules` du Form.Item parent :
 *   rules={[nniRule(t)]}
 */
const NniInput = ({ value, onChange, size, style, placeholder, onBlur, ...rest }) => {
  const { t } = useLanguage();

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (onChange) {
      // Passe un objet event synthétique pour être compatible avec :
      //   - Form.Item → lit e.target.value
      //   - Handlers inline → e => u('nni', e.target.value)
      onChange({ ...e, target: { ...e.target, value: digits } });
    }
  };

  return (
    <Input
      {...rest}
      value={value ?? ''}
      onChange={handleChange}
      onBlur={onBlur}
      maxLength={10}
      size={size}
      style={style}
      placeholder={placeholder ?? t('placeholder.nni')}
    />
  );
};

/**
 * Règle de validation NNI bilingue.
 * Utilisation : rules={[nniRule(t)]}
 * Le paramètre t est optionnel — fallback sur le message français.
 */
export const nniRule = (t) => ({
  pattern: /^[0-9]{10}$/,
  message: t ? t('validation.nni') : 'Le NNI doit contenir uniquement des chiffres (10 chiffres requis).',
});

/** @deprecated Utiliser nniRule(t) à la place */
export const NNI_RULE = nniRule(null);

/**
 * Règle de validation MAJUSCULES pour les champs nom (version française uniquement).
 * En mode arabe (isAr=true) la règle est désactivée.
 *
 * Utilisation : rules={[uppercaseRule(isAr)]}
 */
export const uppercaseRule = (isAr) => ({
  validator(_, value) {
    if (isAr || !value) return Promise.resolve();
    if (value !== value.toUpperCase()) {
      return Promise.reject(new Error('Ce champ doit être saisi en MAJUSCULES.'));
    }
    return Promise.resolve();
  },
});

export default NniInput;

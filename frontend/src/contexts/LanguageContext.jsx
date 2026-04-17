import React, { createContext, useContext, useState, useEffect } from 'react';
import { FR, AR } from '../i18n/translations';
import fieldValue from '../utils/fieldValue';

const LanguageContext = createContext({});

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'fr');

  useEffect(() => {
    document.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key) => {
    const dict = lang === 'ar' ? AR : FR;
    return dict[key] || key;
  };

  const isAr = lang === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';

  const changeLang = (newLang) => {
    localStorage.setItem('lang', newLang);
    setLang(newLang);
  };

  /**
   * field(obj, key)
   * Raccourci lié à la langue courante → délègue à fieldValue(obj, key, isAr)
   * Exemples :
   *   field(nationalite, 'libelle')  →  libelle_ar  ou  libelle  ou  libelle_fr
   *   field(pm, 'denomination')      →  denomination_ar  ou  denomination
   */
  const field = (obj, key) => fieldValue(obj, key, isAr);

  return (
    <LanguageContext.Provider value={{ lang, isAr, dir, t, changeLang, field }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import frFR from 'antd/locale/fr_FR';
import arEG from 'antd/locale/ar_EG';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import 'dayjs/locale/ar';
import App from './App';
import './index.css';
// Police Cairo embarquée localement (pas de dépendance CDN → arabe garanti)
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

dayjs.locale('fr');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const BASE_THEME = {
  colorPrimary:   '#1a4480',
  colorSuccess:   '#2e7d32',
  colorWarning:   '#ed6c02',
  colorError:     '#d32f2f',
  borderRadius:   6,
};

// Wrapper interne pour accéder à useLanguage dans ConfigProvider
const LocalizedApp = () => {
  const { lang, isAr } = useLanguage();

  React.useEffect(() => {
    dayjs.locale(lang);
  }, [lang]);

  // En mode arabe, Cairo en tête → glyphes arabes garantis même si Roboto est chargé
  const theme = {
    token: {
      ...BASE_THEME,
      fontFamily: isAr
        ? "'Cairo', 'Roboto', sans-serif"
        : "'Roboto', 'Cairo', sans-serif",
    },
  };

  return (
    <ConfigProvider
      locale={isAr ? arEG : frFR}
      direction={isAr ? 'rtl' : 'ltr'}
      theme={theme}
    >
      <App />
    </ConfigProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <LocalizedApp />
        </LanguageProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);

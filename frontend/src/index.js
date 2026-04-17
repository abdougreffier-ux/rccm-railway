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

const theme = {
  token: {
    colorPrimary:   '#1a4480',
    colorSuccess:   '#2e7d32',
    colorWarning:   '#ed6c02',
    colorError:     '#d32f2f',
    borderRadius:   6,
    fontFamily:     "'Roboto', 'Cairo', sans-serif",
  },
};

// Wrapper interne pour accéder à useLanguage dans ConfigProvider
const LocalizedApp = () => {
  const { lang, isAr } = useLanguage();

  React.useEffect(() => {
    dayjs.locale(lang);
  }, [lang]);

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

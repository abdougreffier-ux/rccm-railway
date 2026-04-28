import React, { useState } from 'react';
import { Layout, theme } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';
import PdfViewerModal from '../PdfViewerModal';

const { Content } = Layout;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <ErrorBoundary>
        <Sidebar collapsed={collapsed} />
      </ErrorBoundary>
      <Layout>
        <AppHeader collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <Content style={{
          margin: '16px',
          padding: '20px',
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          minHeight: 280,
          overflow: 'auto',
        }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
      {/* Visionneuse PDF intégrée — agents uniquement (api.js détecte le rôle).
          Montée une seule fois au niveau du layout ; accessible depuis tout composant
          via window.__rccmOpenPdfModal(blobUrl, filename). */}
      <PdfViewerModal />
    </Layout>
  );
};

export default AppLayout;

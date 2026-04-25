import React, { useState } from 'react';
import { Layout, theme } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';

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
    </Layout>
  );
};

export default AppLayout;

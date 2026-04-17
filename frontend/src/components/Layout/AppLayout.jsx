import React, { useState } from 'react';
import { Layout, theme } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';

const { Content } = Layout;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} />
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
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

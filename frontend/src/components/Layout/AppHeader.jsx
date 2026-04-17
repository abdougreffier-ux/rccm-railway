import React from 'react';
import { Layout, Button, Space, Avatar, Dropdown, Typography, Tag } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

const { Header } = Layout;
const { Text }   = Typography;

const ROLE_COLOR = { ADMIN: 'red', GREFFIER_CHEF: 'blue', GREFFIER: 'green', VALIDATEUR: 'orange', CONSULTATION: 'default' };

const AppHeader = ({ collapsed, onToggle }) => {
  const { user, logout }      = useAuth();
  const { lang, changeLang, t, isAr } = useLanguage();
  const navigate = useNavigate();

  const menuItems = [
    { key: 'password', icon: <LockOutlined />, label: t('changePassword'), onClick: () => navigate('/administration/mot-de-passe') },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: t('logout'), danger: true, onClick: async () => { await logout(); navigate('/login'); } },
  ];

  return (
    <Header style={{
      padding: '0 16px', background: '#fff', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 100
    }}>
      <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggle} style={{ fontSize: 18 }} />

      <Space>
        {/* Bouton bascule langue */}
        <Button
          size="small"
          onClick={() => changeLang(isAr ? 'fr' : 'ar')}
          style={{
            fontFamily: isAr ? "'Roboto', sans-serif" : "'Cairo', sans-serif",
            fontWeight: 600,
            minWidth: 40,
          }}
        >
          {isAr ? 'FR' : 'ع'}
        </Button>

        <Tag color={ROLE_COLOR[user?.role?.code] || 'default'}>{user?.role?.libelle || ''}</Tag>
        <Text strong>{isAr ? `${user?.prenom} ${user?.nom}` : `${user?.nom} ${user?.prenom}`}</Text>
        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <Avatar icon={<UserOutlined />} style={{ background: '#1a4480', cursor: 'pointer' }} />
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AppHeader;

import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  FileTextOutlined, FileDoneOutlined, InboxOutlined,
  EditOutlined, CloseCircleOutlined, SwapOutlined,
  SearchOutlined, BarChartOutlined, SettingOutlined, TeamOutlined,
  AuditOutlined, HistoryOutlined, SafetyCertificateOutlined,
  BankOutlined, ShopOutlined, PieChartOutlined, CheckSquareOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_GROUP } from '../../config/roles';

const { Sider } = Layout;

// ── Constantes rôles (source unique : config/roles.js) ────────────────────────
const ALL_STAFF     = ROLE_GROUP.ALL_STAFF;
const TRIBUNAL_ONLY = ROLE_GROUP.TRIBUNAL_ONLY;
const GREFFIER_ONLY = ROLE_GROUP.GREFFIER_ONLY;

const Sidebar = ({ collapsed }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { t, isAr } = useLanguage();
  const { hasRole, user } = useAuth();
  const [openKeys, setOpenKeys] = useState(['registres']);

  // Superuser Django → accès complet (équivalent greffier)
  const isSuperuser = user?.is_superuser === true;

  // ── Définition du menu avec les rôles autorisés ───────────────────────────
  // roles: tableau de codes de rôles autorisés à voir cet item
  const RAW_MENU = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: t('nav.dashboard'),
      roles: GREFFIER_ONLY,   // CDC §3.2 : tableau de bord interdit aux agents
    },
    {
      key: 'registres',
      icon: <FileDoneOutlined />,
      label: t('nav.registers'),
      roles: ALL_STAFF,   // AGENT_GU a accès au RC (les enfants filtrent RA/RBE)
      children: [
        { key: '/registres/analytique',    label: t('nav.ra'),  roles: GREFFIER_ONLY },
        { key: '/registres/chronologique', label: t('nav.rc'),  roles: ALL_STAFF },
        {
          key: 'rbe-group',
          icon: <SafetyCertificateOutlined />,
          label: t('nav.rbe') || 'Bénéficiaires effectifs',
          roles: TRIBUNAL_ONLY,
          children: [
            { key: '/registres/rbe',         icon: <BankOutlined />,     label: isAr ? 'تصريحات م.ح' : 'Déclarations BE', roles: TRIBUNAL_ONLY },
            { key: '/registres/rbe/rapport', icon: <PieChartOutlined />, label: isAr ? 'تقارير م.ح'  : 'Rapport BE',      roles: GREFFIER_ONLY },
          ],
        },
      ],
    },
    { key: '/demandes',      icon: <FileTextOutlined />,    label: t('nav.demandes'),      roles: TRIBUNAL_ONLY },
    { key: '/depots',        icon: <InboxOutlined />,       label: t('nav.depots'),        roles: TRIBUNAL_ONLY },
    { key: '/modifications', icon: <EditOutlined />,        label: t('nav.modifications'), roles: TRIBUNAL_ONLY },
    { key: '/radiations',    icon: <CloseCircleOutlined />, label: t('nav.radiations'),    roles: TRIBUNAL_ONLY },
    { key: '/cessions',       icon: <SwapOutlined />,        label: t('nav.cessions'),       roles: TRIBUNAL_ONLY },
    { key: '/cessions-fonds', icon: <ShopOutlined />,        label: t('nav.cessions_fonds'), roles: TRIBUNAL_ONLY },
    { key: '/recherche',     icon: <SearchOutlined />,      label: t('nav.search'),        roles: GREFFIER_ONLY },
    { key: '/rapports',      icon: <BarChartOutlined />,    label: t('nav.reports'),       roles: GREFFIER_ONLY },
    { key: '/journal',         icon: <AuditOutlined />,        label: t('nav.journal'),        roles: GREFFIER_ONLY },
    { key: '/autorisations',     icon: <CheckSquareOutlined />,     label: t('nav.autorisations'),    roles: GREFFIER_ONLY },
    { key: '/mes-autorisations', icon: <LockOutlined />,             label: isAr ? 'طلبات التفويض' : 'Mes autorisations', roles: [AGENT_GU, AGENT_TRIBUNAL] },
    { key: '/certificats',       icon: <SafetyCertificateOutlined />, label: t('nav.certificats') || 'Certificats', roles: TRIBUNAL_ONLY },
    { key: '/historique',      icon: <HistoryOutlined />,      label: t('nav.historique'),     roles: TRIBUNAL_ONLY },
    {
      key: 'admin',
      icon: <SettingOutlined />,
      label: t('nav.admin'),
      roles: GREFFIER_ONLY,
      children: [
        { key: '/administration/utilisateurs', icon: <TeamOutlined />,    label: t('nav.users'),       roles: GREFFIER_ONLY },
        { key: '/administration/parametrage',  icon: <SettingOutlined />, label: t('nav.parametrage'), roles: GREFFIER_ONLY },
      ],
    },
  ];

  // ── Filtre récursif par rôle ──────────────────────────────────────────────
  const filterByRole = (items) =>
    items
      .filter(item => isSuperuser || !item.roles || item.roles.some(r => hasRole(r)))
      .map(item => {
        if (!item.children) return item;
        const filteredChildren = filterByRole(item.children);
        // Si aucun enfant visible, masquer le groupe aussi
        if (filteredChildren.length === 0) return null;
        return { ...item, children: filteredChildren };
      })
      .filter(Boolean);

  const MENU_ITEMS = filterByRole(RAW_MENU);

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={240}
      style={{ background: '#1a4480', overflow: 'auto', height: '100vh', position: 'sticky', top: 0, left: 0 }}
    >
      {/* Logo */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        {!collapsed ? (
          <div style={{
            color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center', lineHeight: 1.3,
            fontFamily: isAr ? "'Cairo', sans-serif" : undefined,
          }}>
            🏛️ {t('appTitle')}<br/>
            <small style={{ fontSize: 10, opacity: 0.8 }}>{t('appSubtitle')}</small>
          </div>
        ) : (
          <span style={{ color: '#fff', fontSize: 20 }}>🏛️</span>
        )}
      </div>

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        openKeys={collapsed ? [] : openKeys}
        onOpenChange={setOpenKeys}
        onClick={({ key }) => navigate(key)}
        items={MENU_ITEMS}
        style={{ background: '#1a4480', borderRight: 0 }}
      />
    </Sider>
  );
};

export default Sidebar;

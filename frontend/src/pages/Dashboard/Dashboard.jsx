import React from 'react';
import { Row, Col, Card, Statistic, Typography, Spin, Tag, Table, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rapportAPI, demandeAPI } from '../../api/api';
import {
  FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, PlusOutlined
} from '@ant-design/icons';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: tdb, isLoading: tdbLoading } = useQuery({
    queryKey: ['tableau-de-bord'],
    queryFn:  () => rapportAPI.tableauDeBord().then(r => r.data),
  });

  const { data: demandesStats } = useQuery({
    queryKey: ['demandes-stats'],
    queryFn:  () => demandeAPI.stats().then(r => r.data),
  });

  const { data: demandes, isLoading: dmdLoading } = useQuery({
    queryKey: ['demandes-recentes'],
    queryFn:  () => demandeAPI.list({ page: 1 }).then(r => r.data),
  });

  if (tdbLoading) return <Spin size="large" style={{ display:'block', margin:'60px auto' }} />;

  const totaux = tdb?.totaux || {};

  const STATUT_DEMANDE = {
    SAISIE:        { color: 'default',  label: t('status.saisie') },
    SOUMISE:       { color: 'blue',     label: t('status.soumise') },
    EN_TRAITEMENT: { color: 'orange',   label: t('status.enTraitement') },
    VALIDEE:       { color: 'success',  label: t('status.validee') },
    REJETEE:       { color: 'error',    label: t('status.rejetee') },
    ANNULEE:       { color: 'default',  label: t('status.annulee') },
  };

  const cardStyle = { borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' };

  const statCols = [
    { title: t('dashboard.totalRegistres'),     value: totaux.registres || 0,       color: '#1a4480', icon: <FileTextOutlined />,    path: '/registres/analytique' },
    { title: t('dashboard.immatriculations'),   value: totaux.immatriculations || 0, color: '#2e7d32', icon: <CheckCircleOutlined />, path: '/registres/analytique' },
    { title: t('dashboard.radiations'),         value: totaux.radiations || 0,       color: '#d32f2f', icon: <CloseCircleOutlined />, path: '/radiations' },
    { title: t('dashboard.demandesEnAttente'),  value: (demandesStats?.data || []).find(s => s.statut === 'SOUMISE')?.total || 0, color: '#ed6c02', icon: <ClockCircleOutlined />, path: '/demandes' },
  ];

  const TYPE_LABELS = { PH: t('entity.ph'), PM: t('entity.pm'), SC: t('entity.sc') };

  const demandeColumns = [
    { title: t('field.numeroDemande'), dataIndex: 'numero_dmd', key: 'numero_dmd', width: 120, render: (v, r) => <a onClick={() => navigate(`/demandes/${r.id}`)}>{v}</a> },
    { title: t('field.type'),          dataIndex: 'type_entite', key: 'type', width: 60, render: v => <Tag>{TYPE_LABELS[v] || v}</Tag> },
    { title: t('field.denomination'),  dataIndex: 'denomination', key: 'denomination', ellipsis: true },
    { title: t('field.date'),          dataIndex: 'date_demande', key: 'date', width: 100 },
    { title: t('field.statut'),        dataIndex: 'statut', key: 'statut', width: 130, render: v => <Tag color={STATUT_DEMANDE[v]?.color}>{STATUT_DEMANDE[v]?.label || v}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>🏠 {t('nav.dashboard')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/demandes/nouvelle')} style={{ background: '#1a4480' }}>
          {t('action.newDemande')}
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCols.map(s => (
          <Col key={s.title} xs={24} sm={12} lg={6}>
            <Card hoverable style={cardStyle} onClick={() => navigate(s.path)}>
              <Statistic title={s.title} value={s.value}
                valueStyle={{ color: s.color, fontSize: 32, fontWeight: 700 }}
                prefix={<span style={{ color: s.color }}>{s.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {(tdb?.ra_par_type || []).map(item => (
          <Col key={item.type_entite} xs={8}>
            <Card style={{ ...cardStyle, textAlign: 'center' }}>
              <Statistic
                title={TYPE_LABELS[item.type_entite] || item.type_entite}
                value={item.total}
                valueStyle={{ color: '#1a4480' }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title={`📋 ${t('dashboard.recentDemandes')}`} style={cardStyle}
        extra={<Button type="link" onClick={() => navigate('/demandes')}>{t('action.viewAll')}</Button>}>
        <Table
          dataSource={demandes?.results || []}
          columns={demandeColumns}
          rowKey="id"
          loading={dmdLoading}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
};

export default Dashboard;

import React from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Tag, Spin, Alert,
  Progress, Space, Divider,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
  FileTextOutlined, BankOutlined, ShopOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { rbeAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title, Text } = Typography;

const TYPE_ENTITE_LABELS = {
  SOCIETE:     'Société commerciale',
  SUCCURSALE:  'Succursale étrangère',
  ASSOCIATION: 'Association',
  ONG:         'ONG',
  FONDATION:   'Fondation',
  FIDUCIE:     'Fiducie / Construction juridique',
  CONSTRUCTION_JURIDIQUE: 'Construction juridique',
};

const TYPE_ENTITE_COLOR = {
  SOCIETE:     'blue',
  SUCCURSALE:  'geekblue',
  ASSOCIATION: 'purple',
  ONG:         'volcano',
  FONDATION:   'gold',
  FIDUCIE:     'orange',
};

const TYPE_DECL_LABELS = {
  INITIALE:     'Initiale',
  MODIFICATION: 'Modification',
  RADIATION:    'Radiation',
};

const RapportRBE = () => {
  const { isAr } = useLanguage();

  const { data: stats, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rbe-reporting'],
    queryFn:  () => rbeAPI.reporting().then(r => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!stats)    return <AccessDenied onRetry={refetch} style="inline" />;

  const { total, par_statut, en_retard, source, par_type_entite, par_type_declaration, hors_rc_sans_declaration } = stats;

  const valide    = par_statut?.VALIDE      || 0;
  const enAttente = par_statut?.EN_ATTENTE  || 0;
  const brouillon = par_statut?.BROUILLON   || 0;
  const retourne  = par_statut?.RETOURNE    || 0;
  const modifie   = par_statut?.MODIFIE     || 0;
  const radie     = par_statut?.RADIE       || 0;

  const pctValide = total > 0 ? Math.round((valide / total) * 100) : 0;

  // By entity type columns
  const typeColumns = [
    {
      title: isAr ? 'نوع الكيان' : 'Type d\'entité',
      dataIndex: 'type_entite',
      key: 'type',
      render: v => (
        <Tag color={TYPE_ENTITE_COLOR[v] || 'default'}>
          {TYPE_ENTITE_LABELS[v] || v}
        </Tag>
      ),
    },
    {
      title: isAr ? 'العدد' : 'Nombre',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      render: v => <strong>{v}</strong>,
    },
    {
      title: isAr ? 'النسبة' : 'Part',
      key: 'pct',
      width: 140,
      render: (_, r) => (
        <Progress
          percent={total > 0 ? Math.round((r.count / total) * 100) : 0}
          size="small"
          strokeColor={TYPE_ENTITE_COLOR[r.type_entite]}
        />
      ),
    },
  ];

  const declColumns = [
    {
      title: isAr ? 'نوع الإقرار' : 'Type de déclaration',
      dataIndex: 'type_declaration',
      key: 'type',
      render: v => <Tag>{TYPE_DECL_LABELS[v] || v}</Tag>,
    },
    {
      title: isAr ? 'العدد' : 'Nombre',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      render: v => <strong>{v}</strong>,
    },
  ];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'}>
      <Title level={4} style={{ marginBottom: 24 }}>
        📊 {isAr ? 'تقرير — سجل المستفيدين الفعليين' : 'Rapport — Registre des Bénéficiaires Effectifs'}
      </Title>

      {/* ── Indicateurs clés ─────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#e6f4ff', borderRadius: 8 }}>
            <Statistic
              title={<Text strong>{isAr ? 'إجمالي الإقرارات' : 'Total déclarations'}</Text>}
              value={total}
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f6ffed', borderRadius: 8 }}>
            <Statistic
              title={<Text strong>{isAr ? 'مُعتمدة' : 'Validées'}</Text>}
              value={valide}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>({pctValide}%)</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#fff7e6', borderRadius: 8 }}>
            <Statistic
              title={<Text strong>{isAr ? 'قيد الانتظار' : 'En attente'}</Text>}
              value={enAttente}
              prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#fff1f0', borderRadius: 8 }}>
            <Statistic
              title={<Text strong>{isAr ? 'متأخرة' : 'En retard'}</Text>}
              value={en_retard}
              prefix={<WarningOutlined style={{ color: '#cf1322' }} />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Source RC vs Hors RC ─────────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card
            title={<Space><BankOutlined />{isAr ? 'كيانات السجل التجاري' : 'Entités RC'}</Space>}
            bordered={false}
            style={{ borderLeft: '4px solid #1677ff' }}
          >
            <Statistic value={source?.rc || 0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card
            title={<Space><ShopOutlined />{isAr ? 'كيانات خارج السجل' : 'Entités hors RC'}</Space>}
            bordered={false}
            style={{ borderLeft: '4px solid #722ed1' }}
          >
            <Statistic value={source?.hors_rc || 0} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card
            title={<Space><ExclamationCircleOutlined />{isAr ? 'كيانات بدون إقرار' : 'Hors RC sans déclaration'}</Space>}
            bordered={false}
            style={{ borderLeft: '4px solid #fa8c16' }}
          >
            <Statistic value={hors_rc_sans_declaration || 0} valueStyle={{ color: '#fa8c16' }} />
            {hors_rc_sans_declaration > 0 && (
              <Text type="warning" style={{ fontSize: 12 }}>
                {isAr ? 'كيانات لم تُقدِّم إقراراً بعد' : 'entités n\'ont pas encore de déclaration'}
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Taux de validation ───────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={5}>{isAr ? 'معدل الاعتماد' : 'Taux de validation'}</Title>
        <Progress
          percent={pctValide}
          status={pctValide === 100 ? 'success' : 'active'}
          strokeColor={pctValide >= 80 ? '#52c41a' : pctValide >= 50 ? '#fa8c16' : '#cf1322'}
          format={p => `${p}% — ${valide} / ${total}`}
        />
      </Card>

      {/* ── Statuts détaillés ────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title={isAr ? 'تفصيل الحالات' : 'Détail par statut'}>
            {[
              { label: isAr ? 'مسودات' : 'Brouillons',          value: brouillon,  color: '#8c8c8c' },
              { label: isAr ? 'قيد الانتظار' : 'En attente',     value: enAttente,  color: '#fa8c16' },
              { label: isAr ? 'معادة' : 'Retournées',            value: retourne,   color: '#faad14' },
              { label: isAr ? 'مُعتمدة' : 'Validées',            value: valide,     color: '#52c41a' },
              { label: isAr ? 'مُعدَّلة' : 'Modifiées',          value: modifie,    color: '#13c2c2' },
              { label: isAr ? 'مُلغاة' : 'Radiées',              value: radie,      color: '#ff4d4f' },
              { label: isAr ? 'متأخرة (تجاوزت الأجل)' : 'En retard (délai dépassé)', value: en_retard, color: '#cf1322' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text>{item.label}</Text>
                  <Text strong style={{ color: item.color }}>{item.value}</Text>
                </div>
                <Progress
                  percent={total > 0 ? Math.round((item.value / total) * 100) : 0}
                  size="small"
                  showInfo={false}
                  strokeColor={item.color}
                />
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={isAr ? 'حسب نوع الإقرار' : 'Par type de déclaration'} style={{ marginBottom: 16 }}>
            <Table
              dataSource={par_type_declaration || []}
              columns={declColumns}
              rowKey="type_declaration"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Répartition par type d'entité ────────────────────────────────────── */}
      <Card title={isAr ? 'التوزيع حسب نوع الكيان' : 'Répartition par type d\'entité'}>
        <Table
          dataSource={par_type_entite || []}
          columns={typeColumns}
          rowKey="type_entite"
          size="small"
          pagination={false}
        />
      </Card>

      <Divider />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {isAr ? 'البيانات محدَّثة تلقائياً كل دقيقة' : 'Données mises à jour automatiquement chaque minute.'}
      </Text>
    </div>
  );
};

export default RapportRBE;

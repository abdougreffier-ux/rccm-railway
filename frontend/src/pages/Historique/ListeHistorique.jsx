import React from 'react';
import {
  Table, Tag, Button, Typography, Card, Row, Col,
  Input, Select, Space, Alert,
} from 'antd';
import {
  PlusOutlined, UploadOutlined, EyeOutlined, HistoryOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { historiqueAPI } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_INSTANCE: 'processing',
  RETOURNE:    'warning',
  VALIDE:      'success',
  REJETE:      'error',
  ANNULE:      'default',
};

const ListeHistorique = () => {
  const navigate = useNavigate();
  const { t, isAr } = useLanguage();
  const { hasRole } = useAuth();
  const isGreffier  = hasRole('GREFFIER');

  const [filters,        setFilters]        = React.useState({});
  const [search,         setSearch]         = React.useState('');
  const [alertDismissed, setAlertDismissed] = React.useState(false);

  const TYPE_LABEL = {
    PH: isAr ? t('entity.ph') : 'Personne physique',
    PM: isAr ? t('entity.pm') : 'Personne morale',
    SC: isAr ? t('entity.sc') : 'Succursale',
  };

  const STATUT_LABEL = {
    BROUILLON:   isAr ? t('status.brouillon')  : 'Brouillon',
    EN_INSTANCE: isAr ? t('status.enInstance') : 'En instance',
    RETOURNE:    isAr ? t('status.retourne')   : 'Retourné',
    VALIDE:      isAr ? t('status.valide')     : 'Validé',
    REJETE:      isAr ? t('status.rejete')     : 'Rejeté',
    ANNULE:      isAr ? t('status.annule')     : 'Annulé',
  };

  // Requête principale (table avec filtres utilisateur)
  const { data, isLoading } = useQuery({
    queryKey: ['historiques', filters],
    queryFn:  () => historiqueAPI.list(filters).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.results || []);
    }),
  });

  // Requête dédiée aux dossiers RETOURNÉS — indépendante des filtres actifs
  // Uniquement pour les agents (le greffier voit tout, il n'a pas besoin d'une alerte)
  const { data: retournes = [] } = useQuery({
    queryKey: ['historiques-retournes'],
    queryFn:  () => historiqueAPI.list({ statut: 'RETOURNE' }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.results || []);
    }),
    enabled: !isGreffier,
    refetchInterval: 60_000,   // rafraîchissement automatique toutes les 60 s
  });

  const showRetourAlert = !isGreffier && !alertDismissed && retournes.length > 0;

  const columns = [
    { title: isAr ? t('field.numeroDemande') : 'N° Demande',    dataIndex: 'numero_demande', key: 'num',    width: 130 },
    { title: isAr ? t('field.numeroRA')      : 'N° Analytique', dataIndex: 'numero_ra',      key: 'ra',     width: 130 },
    {
      title: isAr ? t('common.denomination') : 'Dénomination', dataIndex: 'denomination', key: 'denom', ellipsis: true,
    },
    {
      title: isAr ? t('common.type') : 'Type', dataIndex: 'type_entite', key: 'type', width: 120,
      render: v => <Tag>{TYPE_LABEL[v] || v}</Tag>,
    },
    {
      title: isAr ? t('field.numeroChrono') : 'Chrono', key: 'chrono', width: 120,
      render: (_, r) => `${r.annee_chrono}/${fmtChrono(r.numero_chrono)}`,
    },
    { title: isAr ? t('hist.ph.dateImmat') : 'Date immat.', dataIndex: 'date_immatriculation', key: 'date', width: 120 },
    {
      title: isAr ? t('common.status') : 'Statut', dataIndex: 'statut', key: 'statut', width: 130,
      render: v => <Tag color={STATUT_COLOR[v] || 'default'}>{STATUT_LABEL[v] || v}</Tag>,
    },
    { title: isAr ? t('hist.col.agent') : 'Agent', dataIndex: 'created_by_nom', key: 'agent', width: 140 },
    {
      title: '', key: 'actions', width: 60,
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={e => { e.stopPropagation(); navigate(`/historique/${r.id}`); }} />
      ),
    },
  ];

  const filtered = (data || []).filter(d =>
    !search || d.numero_ra?.includes(search) ||
    d.denomination?.toLowerCase().includes(search.toLowerCase()) ||
    d.numero_demande?.includes(search.toUpperCase())
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HistoryOutlined style={{ fontSize: 24, color: '#1a4480' }} />
          <Title level={4} style={{ margin: 0 }}>
            {isAr ? t('hist.title') : 'Immatriculations historiques'}
          </Title>
        </div>
        <Space>
          {isGreffier && (
            <Button icon={<UploadOutlined />} onClick={() => navigate('/historique/import')}>
              {isAr ? t('hist.importMasse') : 'Import en masse'}
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/historique/nouveau')}
            style={{ background: '#1a4480' }}>
            {isAr ? t('hist.newDemande') : 'Nouvelle demande'}
          </Button>
        </Space>
      </div>

      {/* ── Alerte dossiers retournés ─────────────────────────────────────────── */}
      {showRetourAlert && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          closable
          onClose={() => setAlertDismissed(true)}
          style={{ marginBottom: 16 }}
          message={
            <strong>
              {isAr
                ? `تم إعادة ${retournes.length} ملف/ملفات إليك للتصحيح من قِبل كاتب المحكمة.`
                : `${retournes.length} dossier${retournes.length > 1 ? 's' : ''} retourné${retournes.length > 1 ? 's' : ''} pour correction par le greffier.`}
            </strong>
          }
          description={
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
              {retournes.map(r => (
                <li key={r.id} style={{ marginBottom: 6 }}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                    onClick={() => navigate(`/historique/${r.id}`)}
                  >
                    {r.numero_demande}
                  </Button>
                  {' '}
                  <Text style={{ fontSize: 12 }}>
                    {r.denomination ? `— ${r.denomination}` : ''}
                  </Text>
                  {r.observations && (
                    <div style={{
                      marginTop: 2,
                      padding: '4px 8px',
                      background: '#fffbe6',
                      borderLeft: '3px solid #faad14',
                      fontSize: 12,
                      color: '#555',
                    }}>
                      {isAr ? 'ملاحظة: ' : 'Motif : '}
                      <em>{r.observations}</em>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          }
        />
      )}

      {/* ── Filtres ───────────────────────────────────────────────────────────── */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={12} align="middle">
          <Col span={8}>
            <Input
              placeholder={isAr ? t('hist.searchPH') : 'Rechercher par N° RA, dénomination, N° demande…'}
              value={search} onChange={e => setSearch(e.target.value)} allowClear />
          </Col>
          <Col span={4}>
            <Select style={{ width: '100%' }}
              placeholder={isAr ? t('common.status') : 'Statut'}
              allowClear
              onChange={v => setFilters(f => ({ ...f, statut: v || undefined }))}
              options={[
                { value: 'BROUILLON',   label: isAr ? t('status.brouillon')  : 'Brouillon' },
                { value: 'EN_INSTANCE', label: isAr ? t('status.enInstance') : 'En instance' },
                { value: 'RETOURNE',    label: isAr ? t('status.retourne')   : 'Retourné' },
                { value: 'VALIDE',      label: isAr ? t('status.valide')     : 'Validé' },
                { value: 'REJETE',      label: isAr ? t('status.rejete')     : 'Rejeté' },
              ]}
            />
          </Col>
          <Col span={4}>
            <Select style={{ width: '100%' }}
              placeholder={isAr ? t('field.typeEntite') : 'Type entité'}
              allowClear
              onChange={v => setFilters(f => ({ ...f, type_entite: v || undefined }))}
              options={[
                { value: 'PH', label: isAr ? t('entity.ph') : 'Personne physique' },
                { value: 'PM', label: isAr ? t('entity.pm') : 'Personne morale' },
                { value: 'SC', label: isAr ? t('entity.sc') : 'Succursale' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <Card size="small">
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 20 }}
          onRow={r => ({ onClick: () => navigate(`/historique/${r.id}`) })}
          rowClassName={r => r.statut === 'RETOURNE' ? 'row-retourne cursor-pointer' : 'cursor-pointer'}
        />
      </Card>

      {/* Styles pour les lignes retournées */}
      <style>{`
        .row-retourne td { background: #fffbe6 !important; }
        .row-retourne:hover td { background: #fff1b8 !important; }
      `}</style>
    </div>
  );
};

export default ListeHistorique;

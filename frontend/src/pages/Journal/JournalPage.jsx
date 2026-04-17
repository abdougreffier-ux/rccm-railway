import React, { useState } from 'react';
import {
  Card, Table, Tag, Typography, Button, Row, Col,
  Input, Select, DatePicker, Drawer, Descriptions, Badge,
} from 'antd';
import { SearchOutlined, EyeOutlined, AuditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { journalAPI } from '../../api/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ACTION_COLORS = {
  VALIDATION:              'green',
  VALIDATION_MODIFICATION: 'green',
  VALIDATION_CESSION:      'green',
  VALIDATION_RADIATION:    'green',
  RETOUR:                  'orange',
  RETOUR_MODIFICATION:     'orange',
  RETOUR_CESSION:          'orange',
  REJET_RADIATION:         'red',
  ANNULATION_MODIFICATION: 'volcano',
  ANNULATION_CESSION:      'volcano',
  ANNULATION_RADIATION:    'purple',
  MODIFICATION_CORRECTIVE: 'gold',
  CESSION_CORRECTIVE:      'gold',
  CREATION:                    'blue',
  CREATION_RADIATION:          'blue',
  ENVOI:                       'cyan',
  COMPLETION:                  'geekblue',
  IMMATRICULATION_HISTORIQUE:  'magenta',
};

const ACTION_OPTIONS = [
  { value: '',                        label: 'Toutes les actions' },
  { value: 'VALIDATION',              label: 'Validation (immatriculation)' },
  { value: 'RETOUR',                  label: 'Retour (immatriculation)' },
  { value: 'VALIDATION_MODIFICATION', label: 'Validation modification' },
  { value: 'RETOUR_MODIFICATION',     label: 'Retour modification' },
  { value: 'ANNULATION_MODIFICATION', label: 'Annulation modification' },
  { value: 'MODIFICATION_CORRECTIVE', label: 'Modification corrective' },
  { value: 'VALIDATION_CESSION',      label: 'Validation cession' },
  { value: 'RETOUR_CESSION',          label: 'Retour cession' },
  { value: 'ANNULATION_CESSION',      label: 'Annulation cession' },
  { value: 'CESSION_CORRECTIVE',      label: 'Cession corrective' },
  { value: 'CREATION_RADIATION',      label: 'Création radiation' },
  { value: 'VALIDATION_RADIATION',    label: 'Validation radiation' },
  { value: 'REJET_RADIATION',         label: 'Rejet radiation' },
  { value: 'ANNULATION_RADIATION',       label: 'Annulation radiation' },
  { value: 'IMMATRICULATION_HISTORIQUE', label: 'Immatriculation historique' },
];

const JsonView = ({ data, label }) => {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return <Text type="secondary">—</Text>;
  }
  return (
    <div>
      {label && <Text strong style={{ display: 'block', marginBottom: 4 }}>{label}</Text>}
      <pre style={{
        background: '#f5f5f5', border: '1px solid #e8e8e8',
        borderRadius: 4, padding: '8px 12px', fontSize: 12,
        maxHeight: 250, overflow: 'auto', margin: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

const JournalPage = () => {
  const [filters,     setFilters]     = useState({ date_debut: '', date_fin: '', action: '', ra_numero: '', greffier: '' });
  const [activeFilters, setActiveFilters] = useState({});
  const [selected,    setSelected]    = useState(null);
  const [drawerOpen,  setDrawerOpen]  = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['journal', activeFilters],
    queryFn:  () => journalAPI.list(activeFilters).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.results || []);
    }),
  });

  const handleSearch = () => {
    const f = {};
    if (filters.date_debut) f.date_debut = filters.date_debut;
    if (filters.date_fin)   f.date_fin   = filters.date_fin;
    if (filters.action)     f.action     = filters.action;
    if (filters.ra_numero)  f.ra_numero  = filters.ra_numero.trim();
    if (filters.greffier)   f.greffier   = filters.greffier.trim();
    setActiveFilters(f);
  };

  const handleReset = () => {
    setFilters({ date_debut: '', date_fin: '', action: '', ra_numero: '', greffier: '' });
    setActiveFilters({});
  };

  const openDetail = (record) => { setSelected(record); setDrawerOpen(true); };

  const columns = [
    {
      title: 'Date / Heure',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: v => v ? new Date(v).toLocaleString('fr-FR') : '—',
    },
    {
      title: 'Type d\'action',
      dataIndex: 'action_label',
      key: 'action',
      width: 220,
      render: (label, r) => (
        <Tag color={ACTION_COLORS[r.action] || 'default'}>{label}</Tag>
      ),
    },
    {
      title: 'Greffier / Utilisateur',
      dataIndex: 'created_by_nom',
      key: 'greffier',
      width: 180,
    },
    {
      title: 'N° Analytique',
      dataIndex: 'ra_numero',
      key: 'ra_numero',
      width: 130,
    },
    {
      title: 'Dénomination',
      dataIndex: 'ra_denomination',
      key: 'denomination',
      ellipsis: true,
    },
    {
      title: 'Réf. opération',
      dataIndex: 'reference_operation',
      key: 'ref_op',
      width: 130,
      render: v => v || '—',
    },
    {
      title: 'Détail',
      key: 'detail',
      width: 80,
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} />
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <AuditOutlined style={{ fontSize: 24, color: '#1a4480' }} />
        <Title level={4} style={{ margin: 0 }}>Journal des actions du greffier</Title>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="bottom">
          <Col span={6}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>Période</div>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              onChange={(_, strings) => setFilters(f => ({
                ...f,
                date_debut: strings[0] ? dayjs(strings[0], 'DD/MM/YYYY').format('YYYY-MM-DD') : '',
                date_fin:   strings[1] ? dayjs(strings[1], 'DD/MM/YYYY').format('YYYY-MM-DD') : '',
              }))}
            />
          </Col>
          <Col span={5}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>Type d'action</div>
            <Select
              style={{ width: '100%' }}
              options={ACTION_OPTIONS}
              value={filters.action}
              onChange={v => setFilters(f => ({ ...f, action: v }))}
            />
          </Col>
          <Col span={4}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>N° Analytique</div>
            <Input
              placeholder="ex: 000013"
              value={filters.ra_numero}
              onChange={e => setFilters(f => ({ ...f, ra_numero: e.target.value }))}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col span={4}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>Greffier</div>
            <Input
              placeholder="Nom ou login"
              value={filters.greffier}
              onChange={e => setFilters(f => ({ ...f, greffier: e.target.value }))}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col span={5}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}
              style={{ background: '#1a4480', marginRight: 8 }}>
              Rechercher
            </Button>
            <Button onClick={handleReset}>Réinitialiser</Button>
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <div style={{ marginBottom: 8 }}>
          <Badge count={data.length} showZero color="#1a4480" />
          <Text type="secondary" style={{ marginLeft: 8 }}>entrées trouvées</Text>
        </div>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Drawer
        title={selected ? `${selected.action_label} — ${selected.ra_numero}` : ''}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
        destroyOnClose
      >
        {selected && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Date">{new Date(selected.created_at).toLocaleString('fr-FR')}</Descriptions.Item>
              <Descriptions.Item label="Action">
                <Tag color={ACTION_COLORS[selected.action] || 'default'}>{selected.action_label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Utilisateur">{selected.created_by_nom}</Descriptions.Item>
              <Descriptions.Item label="N° Analytique">{selected.ra_numero}</Descriptions.Item>
              <Descriptions.Item label="Dénomination">{selected.ra_denomination}</Descriptions.Item>
              {selected.reference_operation && (
                <Descriptions.Item label="Réf. opération">{selected.reference_operation}</Descriptions.Item>
              )}
              {selected.commentaire && (
                <Descriptions.Item label="Commentaire">{selected.commentaire}</Descriptions.Item>
              )}
            </Descriptions>

            {(selected.etat_avant || selected.etat_apres) && (
              <div>
                <Title level={5} style={{ marginBottom: 12 }}>Comparaison avant / après</Title>
                <Row gutter={12}>
                  <Col span={12}>
                    <JsonView data={selected.etat_avant} label="État avant" />
                  </Col>
                  <Col span={12}>
                    <JsonView data={selected.etat_apres} label="État après" />
                  </Col>
                </Row>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default JournalPage;

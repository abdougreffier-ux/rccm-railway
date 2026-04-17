import React, { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Tooltip, Select } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cessionAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const ListeCessions = () => {
  const [page,   setPage]   = useState(1);
  const [statut, setStatut] = useState('');
  const navigate            = useNavigate();
  const { t }               = useLanguage();
  const STATUT_CONFIG = {
    BROUILLON:   { color: 'default',    label: t('status.brouillon')   },
    EN_INSTANCE: { color: 'processing', label: t('status.enInstance2') },
    RETOURNE:    { color: 'warning',    label: t('status.retourne')    },
    VALIDE:      { color: 'success',    label: t('status.valide')      },
    ANNULE:      { color: 'error',      label: t('status.annule')      },
  };

  const { data, isLoading } = useQuery({
    queryKey: ['cessions', page, statut],
    queryFn:  () => cessionAPI.list({ page, statut: statut || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { title: 'N° Cession',    dataIndex: 'numero_cession',  key: 'numero_cession',  width: 150 },
    { title: 'N° Analytique', dataIndex: 'ra_numero',       key: 'ra_numero',       width: 130 },
    { title: 'Dénomination',  dataIndex: 'ra_denomination', key: 'ra_denomination', ellipsis: true },
    { title: 'Cédant(s)', key: 'cedants', ellipsis: true,
      render: (_, r) => {
        if (r.lignes?.length > 0) {
          const cedants = [...new Map(r.lignes.map(l => [l.cedant_associe_id, l.cedant_nom])).values()];
          return cedants.length > 1
            ? <><Tag color="orange">{cedants.length}</Tag>{cedants.join(', ')}</>
            : cedants[0] || '—';
        }
        if (r.cedants?.length > 0) {
          return r.cedants.length > 1
            ? <><Tag color="orange">{r.cedants.length}</Tag>{r.cedants.map(c => c.nom).join(', ')}</>
            : r.cedants[0]?.nom || '—';
        }
        return r.cedant_nom || '—';
      } },
    { title: 'Cessionnaire(s)', key: 'cessionnaires', ellipsis: true,
      render: (_, r) => {
        if (r.lignes?.length > 0) {
          const noms = [...new Set(r.lignes.map(l =>
            l.cessionnaire_type === 'NOUVEAU'
              ? `${l.cessionnaire_prenom || ''} ${l.cessionnaire_nom || ''}`.trim()
              : l.cessionnaire_nom || '—'
          ))];
          return noms.length > 1
            ? <><Tag color="blue">{noms.length}</Tag>{noms.join(', ')}</>
            : noms[0] || '—';
        }
        if (r.cessionnaires?.length > 0) {
          return r.cessionnaires.length > 1
            ? <><Tag color="blue">{r.cessionnaires.length}</Tag>{r.cessionnaires.map(c => c.nom || c.prenom).join(', ')}</>
            : r.cessionnaires[0]?.nom || '—';
        }
        return r.beneficiaire_nom || '—';
      } },
    { title: 'Lignes', key: 'lignes', width: 80, align: 'center',
      render: (_, r) => r.lignes?.length > 0
        ? <Tag color="green">{r.lignes.length}</Tag>
        : '—' },
    { title: 'Type', key: 'type_cession', width: 100,
      render: (_, r) => {
        if (r.lignes?.length > 1) return <Tag color="purple">Multiple</Tag>;
        const v = r.cedants?.[0]?.type_cession || r.type_cession_parts;
        return v === 'TOTALE' ? <Tag color="blue">Totale</Tag> : v === 'PARTIELLE' ? <Tag color="cyan">Partielle</Tag> : '—';
      } },
    { title: 'Date',          dataIndex: 'date_cession',    key: 'date_cession',    width: 110 },
    { title: 'Statut',        dataIndex: 'statut',          key: 'statut',          width: 130,
      render: v => <Tag color={STATUT_CONFIG[v]?.color}>{STATUT_CONFIG[v]?.label || v}</Tag> },
    { title: 'Actions', key: 'actions', width: 80, fixed: 'right',
      render: (_, r) => (
        <Tooltip title="Consulter">
          <Button size="small" icon={<EyeOutlined />} onClick={e => { e.stopPropagation(); navigate(`/cessions/${r.id}`); }} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Cessions de parts / actions</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => navigate('/cessions/nouvelle')}
          style={{ background: '#1a4480' }}>
          Nouvelle cession
        </Button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrer par statut" value={statut || undefined}
          onChange={v => { setStatut(v || ''); setPage(1); }}
          allowClear style={{ width: 220 }}
          options={Object.entries(STATUT_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
      </div>
      <Table
        dataSource={data?.results || []} columns={columns} rowKey="id"
        loading={isLoading} scroll={{ x: 1000 }}
        onRow={r => ({ onClick: () => navigate(`/cessions/${r.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page, pageSize: 20, total: data?.count || 0, onChange: setPage,
          showTotal: total => `${total} cession(s)`, showSizeChanger: false,
        }}
        size="small"
      />
    </div>
  );
};

export default ListeCessions;

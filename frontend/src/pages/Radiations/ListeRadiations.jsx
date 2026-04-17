import React, { useState } from 'react';
import { Table, Tag, Typography, Select, Button, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { radiationAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { getMotifLabel } from './motifRadiation';

const { Title } = Typography;

const ListeRadiations = () => {
  const [page,   setPage]   = useState(1);
  const [statut, setStatut] = useState('');
  const navigate  = useNavigate();
  const { t, isAr } = useLanguage();
  const STATUT_CONFIG = {
    EN_COURS: { color: 'processing', label: t('status.enCours')  },
    VALIDEE:  { color: 'success',    label: t('status.validee')  },
    REJETEE:  { color: 'error',      label: t('status.rejetee')  },
    ANNULEE:  { color: 'default',    label: t('status.annulee')  },
  };

  const { data, isLoading } = useQuery({
    queryKey: ['radiations', page, statut],
    queryFn:  () => radiationAPI.list({ page, statut: statut || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { title: 'N° Radiation',    dataIndex: 'numero_radia',   key: 'numero_radia',   width: 150 },
    { title: 'N° Analytique',   dataIndex: 'ra_numero',      key: 'ra_numero',      width: 130 },
    { title: 'Dénomination',    dataIndex: 'ra_denomination', key: 'ra_denomination', ellipsis: true },
    { title: isAr ? 'السبب' : 'Motif', dataIndex: 'motif', key: 'motif', width: 160,
      render: v => v ? <Tag color="red">{getMotifLabel(v, isAr)}</Tag> : '—' },
    { title: 'Date radiation',  dataIndex: 'date_radiation', key: 'date_radiation', width: 130 },
    { title: 'Statut',          dataIndex: 'statut',         key: 'statut',         width: 130,
      render: v => <Tag color={STATUT_CONFIG[v]?.color}>{STATUT_CONFIG[v]?.label || v}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Radiations</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ background: '#b91c1c' }}
          onClick={() => navigate('/radiations/nouvelle')}
        >
          Nouvelle radiation
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filtrer par statut"
          value={statut || undefined}
          onChange={v => { setStatut(v || ''); setPage(1); }}
          allowClear
          style={{ width: 220 }}
          options={Object.entries(STATUT_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </Space>

      <Table
        dataSource={data?.results || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 900 }}
        onRow={record => ({ onClick: () => navigate(`/radiations/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page, pageSize: 20,
          total: data?.count || 0,
          onChange: setPage,
          showTotal: total => `${total} radiation(s)`,
          showSizeChanger: false,
        }}
        size="small"
      />
    </div>
  );
};

export default ListeRadiations;

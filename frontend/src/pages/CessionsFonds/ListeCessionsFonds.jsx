import React, { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Tooltip, Select, Alert } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cessionsFondsAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const STATUT_CONFIG = {
  BROUILLON:       { color: 'default',    label: 'Brouillon' },
  EN_INSTANCE:     { color: 'processing', label: 'En instance' },
  RETOURNE:        { color: 'warning',    label: 'Retourné' },
  VALIDE:          { color: 'success',    label: 'Validé' },
  ANNULE:          { color: 'error',      label: 'Annulé' },
  ANNULE_GREFFIER: { color: 'error',      label: 'Annulé (greffier)' },
};

const TYPE_ACTE_LABELS = { NOTARIE: 'Acte notarié', SEING_PRIVE: 'Seing privé' };

const ListeCessionsFonds = () => {
  const [page,   setPage]   = useState(1);
  const [statut, setStatut] = useState('');
  const navigate = useNavigate();
  const { isAr } = useLanguage();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cessions-fonds', page, statut],
    queryFn:  () => cessionsFondsAPI.list({ page, statut: statut || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { title: isAr ? 'رقم CF' : 'N° CF', dataIndex: 'numero_cession_fonds', key: 'ncf', width: 150 },
    { title: isAr ? 'الرقم التحليلي' : 'N° Analytique', dataIndex: 'ra_numero', key: 'ra', width: 130 },
    { title: isAr ? 'التسمية' : 'Dénomination', dataIndex: 'ra_denomination', key: 'denom', ellipsis: true },
    { title: isAr ? 'المتنازِل' : 'Cédant', dataIndex: 'cedant_nom', key: 'cedant', ellipsis: true },
    { title: isAr ? 'المتنازَل إليه' : 'Cessionnaire', dataIndex: 'cessionnaire_nom', key: 'cess', ellipsis: true },
    {
      title: isAr ? 'نوع العقد' : 'Type acte', dataIndex: 'type_acte', key: 'ta', width: 120,
      render: v => TYPE_ACTE_LABELS[v] || v || '—',
    },
    { title: isAr ? 'تاريخ التنازل' : 'Date cession', dataIndex: 'date_cession', key: 'date', width: 120 },
    {
      title: isAr ? 'الحالة' : 'Statut', dataIndex: 'statut', key: 'statut', width: 130,
      render: v => <Tag color={STATUT_CONFIG[v]?.color}>{STATUT_CONFIG[v]?.label || v}</Tag>,
    },
    {
      title: isAr ? 'إجراء' : 'Actions', key: 'actions', width: 80, fixed: 'right',
      render: (_, r) => (
        <Tooltip title={isAr ? 'عرض' : 'Consulter'}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={e => { e.stopPropagation(); navigate(`/cessions-fonds/${r.id}`); }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {isAr ? 'التنازلات عن المحلات التجارية' : 'Cessions de fonds de commerce'}
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/cessions-fonds/nouvelle')}
          style={{ background: '#1a4480' }}
        >
          {isAr ? 'تنازل جديد' : 'Nouvelle cession de fonds'}
        </Button>
      </div>

      {isError && (
        <Alert
          type="warning"
          showIcon
          message={isAr ? 'تعذّر تحميل التنازلات' : 'Impossible de charger les cessions de fonds'}
          description={isAr
            ? 'تحقق من صلاحياتك أو أعد تحميل الصفحة.'
            : 'Vérifiez vos permissions ou rechargez la page.'}
          style={{ marginBottom: 16 }}
        />
      )}

      <Space style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 180 }}
          placeholder={isAr ? 'تصفية حسب الحالة' : 'Filtrer par statut'}
          allowClear
          value={statut || undefined}
          onChange={v => { setStatut(v || ''); setPage(1); }}
          options={Object.entries(STATUT_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.results || []}
        onRow={r => ({ onClick: () => navigate(`/cessions-fonds/${r.id}`) })}
        rowClassName={() => 'pointer-row'}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.count || 0,
          onChange: p => setPage(p),
          showSizeChanger: false,
          showTotal: t => `${t} ${isAr ? 'سجل' : 'enregistrement(s)'}`,
        }}
        scroll={{ x: 1000 }}
        size="small"
      />
    </div>
  );
};

export default ListeCessionsFonds;

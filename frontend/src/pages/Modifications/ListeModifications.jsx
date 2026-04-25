import React, { useState } from 'react';
import { Table, Button, Tag, Typography, Tooltip, Select, Alert, Space } from 'antd';
import { PlusOutlined, EyeOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { modifAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

const ListeModifications = () => {
  const [page,   setPage]   = useState(1);
  const [statut, setStatut] = useState('');
  const navigate            = useNavigate();
  const { t, isAr }         = useLanguage();
  const { hasRole }         = useAuth();
  const isGreffier          = hasRole('GREFFIER');
  const STATUT_CONFIG = {
    BROUILLON:   { color: 'default',    label: t('status.brouillon')   },
    EN_INSTANCE: { color: 'processing', label: t('status.enInstance2') },
    RETOURNE:    { color: 'warning',    label: t('status.retourne')    },
    VALIDE:      { color: 'success',    label: t('status.valide')      },
    ANNULE:      { color: 'error',      label: t('status.annule')      },
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['modifications', page, statut],
    queryFn:  () => modifAPI.list({ page, statut: statut || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { title: isAr ? 'رقم التعديل' : 'N° Modification', dataIndex: 'numero_modif', key: 'numero_modif', width: 160 },
    { title: isAr ? 'رقم قيد'     : 'N° Analytique',   dataIndex: 'ra_numero',    key: 'ra_numero',    width: 130 },
    { title: isAr ? 'التسمية'     : 'Dénomination',    dataIndex: 'ra_denomination', key: 'ra_denomination', ellipsis: true },
    { title: isAr ? 'التاريخ'     : 'Date',            dataIndex: 'date_modif',   key: 'date_modif',   width: 110 },
    {
      title: isAr ? 'الحالة' : 'Statut', dataIndex: 'statut', key: 'statut', width: 180,
      render: (v) => (<Tag color={STATUT_CONFIG[v]?.color}>{STATUT_CONFIG[v]?.label || v}</Tag>),
    },
    {
      title: isAr ? 'إجراءات' : 'Actions', key: 'actions', width: 80, fixed: 'right',
      render: (_, r) => (
        <Tooltip title={isAr ? 'استشارة' : 'Consulter'}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/modifications/${r.id}`)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{isAr ? 'التعديلات' : 'Modifications'}</Title>
        {/*
          Règle CDC §3.2 : les inscriptions modificatives sont INITIÉES par les agents du tribunal.
          Le greffier valide — il ne crée pas. Le bouton est toujours rendu (jamais conditionné aux
          données) ; il est désactivé pour le greffier avec un message explicite bilingue.
        */}
        {isGreffier ? (
          <Tooltip
            title={isAr
              ? 'يُنشئ قيود التعديل أعوانُ المحكمة حصراً — يتولى الكاتب التحقق والمصادقة'
              : 'Les inscriptions modificatives sont initiées par les agents du tribunal — le greffier valide uniquement'}
          >
            <Button disabled icon={<LockOutlined />}>
              {isAr ? 'قيد تعديل جديد' : 'Nouvelle modification'}
            </Button>
          </Tooltip>
        ) : (
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate('/modifications/nouvelle')}
            style={{ background: '#1a4480' }}>
            {isAr ? 'قيد تعديل جديد' : 'Nouvelle modification'}
          </Button>
        )}
      </div>

      {isError && (
        <Alert
          type="warning"
          showIcon
          message={isAr ? 'تعذّر تحميل القيود' : 'Impossible de charger les modifications'}
          description={isAr
            ? 'تحقق من صلاحياتك أو أعد تحميل الصفحة.'
            : 'Vérifiez vos permissions ou rechargez la page.'}
          style={{ marginBottom: 16 }}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrer par statut" value={statut || undefined}
          onChange={v => { setStatut(v || ''); setPage(1); }}
          allowClear style={{ width: 220 }}
          options={Object.entries(STATUT_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
      </div>

      <Table
        dataSource={data?.results || []} columns={columns} rowKey="id"
        loading={isLoading} scroll={{ x: 800 }}
        onRow={r => ({
          onClick: () => navigate(`/modifications/${r.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page, pageSize: 20, total: data?.count || 0, onChange: setPage,
          showTotal: total => `${total} modification(s)`, showSizeChanger: false,
        }}
        size="small"
      />
    </div>
  );
};

export default ListeModifications;

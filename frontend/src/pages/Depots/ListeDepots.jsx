import React, { useState } from 'react';
import {
  Table, Button, Space, Typography, Tooltip, Input, Tag, Alert,
} from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { depotAPI } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatCivilite } from '../../utils/civilite';

const { Title } = Typography;
const { Search } = Input;

const ListeDepots = () => {
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const navigate   = useNavigate();
  const { hasRole } = useAuth();
  const isGreffier  = hasRole('GREFFIER');
  const { isAr }    = useLanguage();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['depots', page, search],
    queryFn:  () => depotAPI.list({
      page,
      page_size: 20,
      search: search || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    {
      title: 'N° Dépôt', dataIndex: 'numero_depot', key: 'numero_depot', width: 140,
      render: (v, r) => (
        <Button type="link" style={{ padding: 0, fontWeight: 600 }}
          onClick={() => navigate(`/depots/${r.id}`)}>
          {v}
        </Button>
      ),
    },
    { title: 'Date',        dataIndex: 'date_depot',  key: 'date_depot',  width: 110 },
    {
      title: 'Déposant', key: 'deposant',
      render: (_, r) => {
        const civ = formatCivilite(r.civilite_deposant, isAr ? 'ar' : 'fr');
        return [civ, r.prenom_deposant, r.nom_deposant].filter(Boolean).join(' ') || '—';
      },
    },
    { title: 'Dénomination', dataIndex: 'denomination', key: 'denomination', ellipsis: true },
    {
      title: 'Forme jur.', dataIndex: 'forme_juridique_libelle', key: 'fj', width: 160,
      render: v => v ? <Tag>{v}</Tag> : '—',
    },
    { title: 'Créé par', dataIndex: 'created_by_nom', key: 'created_by', width: 140, render: v => v || '—' },
    {
      title: 'Actions', key: 'actions', width: 90, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title="Consulter">
            <Button size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/depots/${r.id}`)} />
          </Tooltip>
          {/* Modifier — agents uniquement, tous statuts sauf validé/archivé */}
          {!isGreffier && (
            <Tooltip title="Modifier">
              <Button size="small" icon={<EditOutlined />}
                onClick={() => navigate(`/depots/${r.id}/modifier`)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>{isAr ? '📥 الإيداعات' : '📥 Dépôts'}</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => navigate('/depots/nouveau')}
          style={{ background: '#1a4480' }}>
          {isAr ? 'إيداع جديد' : 'Nouveau dépôt'}
        </Button>
      </div>

      {isError && (
        <Alert
          type="warning"
          showIcon
          message={isAr ? 'تعذّر تحميل الإيداعات' : 'Impossible de charger les dépôts'}
          description={isAr
            ? 'تحقق من صلاحياتك أو أعد تحميل الصفحة.'
            : 'Vérifiez vos permissions ou rechargez la page.'}
          style={{ marginBottom: 16 }}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <Search
          placeholder="Rechercher par N° dépôt, dénomination, déposant..."
          allowClear
          style={{ maxWidth: 400 }}
          onSearch={v => { setSearch(v); setPage(1); }}
          onChange={e => { if (!e.target.value) { setSearch(''); setPage(1); } }}
        />
      </div>

      <Table
        dataSource={data?.results || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 900 }}
        size="small"
        pagination={{
          current:  page,
          pageSize: 20,
          total:    data?.count || 0,
          onChange: setPage,
          showTotal: total => `${total} dépôt(s)`,
          showSizeChanger: false,
        }}
        onRow={r => ({ onClick: () => navigate(`/depots/${r.id}`), style: { cursor: 'pointer' } })}
      />
    </div>
  );
};

export default ListeDepots;

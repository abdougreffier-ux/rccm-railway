import React, { useState } from 'react';
import { Table, Button, Space, Input, Typography, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { scAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const ListeSuccursale = () => {
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const navigate = useNavigate();
  const { t }    = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['succursales', page, search],
    queryFn:  () => scAPI.list({ page, search }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { title: t('field.denomination'), dataIndex: 'denomination',  key: 'denomination', sorter: true,
      render: (v, r) => <a onClick={() => navigate(`/succursales/${r.id}/modifier`)}>{v}</a> },
    { title: t('field.paysOrigine'),  dataIndex: 'pays_origine',  key: 'pays_origine' },
    { title: t('field.capitalAffecte'), dataIndex: 'capital_affecte', key: 'capital', width: 160,
      render: (v, r) => v ? `${Number(v).toLocaleString()} ${r.devise || ''}` : '-' },
    { title: t('field.telephone'),   dataIndex: 'telephone',     key: 'telephone', width: 130 },
    {
      title: t('field.actions'), key: 'actions', width: 90, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('action.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/succursales/${r.id}/modifier`)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('page.sc')}</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => navigate('/succursales/nouveau')}
          style={{ background: '#1a4480' }}>
          {t('action.newSuccursale')}
        </Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder={t('placeholder.searchSC')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 400 }} allowClear />
      </div>

      <Table
        dataSource={data?.results || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 900 }}
        pagination={{
          current: page, pageSize: 20,
          total: data?.count || 0,
          onChange: setPage,
          showTotal: total => `${total} ${t('pagination.sc')}`,
          showSizeChanger: false,
        }}
        size="small"
      />
    </div>
  );
};

export default ListeSuccursale;

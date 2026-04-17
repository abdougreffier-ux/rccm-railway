import React, { useState } from 'react';
import { Table, Button, Space, Input, Typography, Tag, Tooltip, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pmAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const ListePM = () => {
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { t }       = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['personnes-morales', page, search],
    queryFn:  () => pmAPI.list({ page, search }).then(r => r.data),
    keepPreviousData: true,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => pmAPI.delete(id),
    onSuccess:  () => { message.success(t('msg.deleted')); queryClient.invalidateQueries({ queryKey: ['personnes-morales'] }); },
    onError:    (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const columns = [
    { title: t('field.denomination'), dataIndex: 'denomination', key: 'denomination', sorter: true,
      render: (v, r) => <a onClick={() => navigate(`/registres/analytique?pm_id=${r.id}`)}>{v}</a> },
    { title: t('field.sigle.col'),    dataIndex: 'sigle',                  key: 'sigle',   width: 80 },
    { title: t('field.formeJuridique.col'), dataIndex: 'forme_juridique_libelle', key: 'fj' },
    { title: t('field.capital'),      dataIndex: 'capital_social',         key: 'capital', width: 140,
      render: (v, r) => v ? `${Number(v).toLocaleString()} ${r.devise_capital}` : '-' },
    { title: t('field.telephone'),    dataIndex: 'telephone',              key: 'tel',     width: 120 },
    {
      title: t('field.actions'), key: 'actions', width: 110, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('action.register')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/registres/analytique?pm_id=${r.id}`)} />
          </Tooltip>
          <Tooltip title={t('action.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/personnes-morales/${r.id}/modifier`)} />
          </Tooltip>
          <Popconfirm title={t('confirm.delete')} onConfirm={() => deleteMut.mutate(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('page.pm')}</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => navigate('/personnes-morales/nouveau')}
          style={{ background: '#1a4480' }}>
          {t('action.newSociete')}
        </Button>
      </div>
      <Input.Search
        placeholder={t('placeholder.searchPM')}
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width: 400, marginBottom: 16 }} allowClear />
      <Table
        dataSource={data?.results || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 1000 }}
        pagination={{
          current: page, pageSize: 20,
          total: data?.count || 0,
          onChange: setPage,
          showTotal: total => `${total} ${t('pagination.pm')}`,
        }}
        size="small"
      />
    </div>
  );
};

export default ListePM;

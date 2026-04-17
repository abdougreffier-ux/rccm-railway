import React, { useState } from 'react';
import { Table, Button, Space, Input, Typography, Popconfirm, message, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { phAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatCivilite } from '../../utils/civilite';

const { Title } = Typography;

const ListePH = () => {
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { t, isAr } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['personnes-physiques', page, search],
    queryFn:  () => phAPI.list({ page, search }).then(r => r.data),
    keepPreviousData: true,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => phAPI.delete(id),
    onSuccess:  () => { message.success(t('msg.deleted')); queryClient.invalidateQueries({ queryKey: ['personnes-physiques'] }); },
    onError:    (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const columns = [
    { title: t('field.nni'),        dataIndex: 'nni',                key: 'nni',         width: 130 },
    {
      title: t('field.nom'), key: 'nom', sorter: true,
      render: (_, r) => {
        const civ = formatCivilite(r.civilite, isAr ? 'ar' : 'fr');
        return [civ, r.prenom, r.nom].filter(Boolean).join(' ');
      },
    },
    { title: t('field.nationalite'),dataIndex: 'nationalite_libelle',key: 'nationalite' },
    { title: t('field.telephone'),  dataIndex: 'telephone',          key: 'telephone' },
    { title: t('field.email'),      dataIndex: 'email',              key: 'email',       ellipsis: true },
    {
      title: t('field.actions'), key: 'actions', width: 120, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('action.view')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/registres/analytique?ph_id=${r.id}`)} />
          </Tooltip>
          <Tooltip title={t('action.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/personnes-physiques/${r.id}/modifier`)} />
          </Tooltip>
          <Popconfirm title={t('confirm.delete')} onConfirm={() => deleteMut.mutate(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <Tooltip title={t('action.delete')}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('page.ph')}</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => navigate('/personnes-physiques/nouveau')}
          style={{ background: '#1a4480' }}>
          {t('action.new')}
        </Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder={t('placeholder.searchPH')}
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
          showTotal: total => `${total} ${t('pagination.ph')}`,
          showSizeChanger: false,
        }}
        size="small"
      />
    </div>
  );
};

export default ListePH;

import React, { useState } from 'react';
import { Table, Button, Space, Input, Select, Tag, Typography, Tooltip, message } from 'antd';
import { PlusOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { demandeAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const ListeDemandes = () => {
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [page,   setPage]   = useState(1);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { t }       = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['demandes', page, search, statut],
    queryFn:  () => demandeAPI.list({ page, search, statut: statut || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const validerMut = useMutation({
    mutationFn: (id) => demandeAPI.valider(id),
    onSuccess: () => { message.success(t('msg.saved')); queryClient.invalidateQueries({ queryKey: ['demandes'] }); },
    onError:   (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const rejeterMut = useMutation({
    mutationFn: ({ id, motif }) => demandeAPI.rejeter(id, motif),
    onSuccess: () => { message.warning(t('status.rejetee')); queryClient.invalidateQueries({ queryKey: ['demandes'] }); },
  });

  const STATUT_CONFIG = {
    SAISIE:        { color: 'default',  label: t('status.saisie') },
    SOUMISE:       { color: 'blue',     label: t('status.soumise') },
    EN_TRAITEMENT: { color: 'orange',   label: t('status.enTraitement') },
    VALIDEE:       { color: 'success',  label: t('status.validee') },
    REJETEE:       { color: 'error',    label: t('status.rejetee') },
    ANNULEE:       { color: 'default',  label: t('status.annulee') },
  };

  const TYPE_LABELS = { PH: t('entity.ph'), PM: t('entity.pm'), SC: t('entity.sc') };

  const columns = [
    { title: t('field.numeroDemande'), dataIndex: 'numero_dmd',         key: 'numero', width: 130,
      render: (v, r) => <a onClick={() => navigate(`/demandes/${r.id}`)}>{v}</a> },
    { title: t('field.type'),          dataIndex: 'type_entite',         key: 'type',   width: 70,
      render: v => <Tag>{TYPE_LABELS[v] || v}</Tag> },
    { title: t('field.typeDemande'),   dataIndex: 'type_demande_libelle',key: 'td',     ellipsis: true },
    { title: t('field.denomination'),  dataIndex: 'denomination',        key: 'denom',  ellipsis: true },
    { title: t('field.date'),          dataIndex: 'date_demande',        key: 'date',   width: 100 },
    { title: t('field.canal'),         dataIndex: 'canal',               key: 'canal',  width: 100,
      render: v => <Tag color={v === 'EN_LIGNE' ? 'blue' : 'default'}>{v}</Tag> },
    { title: t('field.statut'),        dataIndex: 'statut',              key: 'statut', width: 150,
      render: v => <Tag color={STATUT_CONFIG[v]?.color}>{STATUT_CONFIG[v]?.label || v}</Tag> },
    { title: t('field.agent'),         dataIndex: 'agent',               key: 'agent',  width: 120, ellipsis: true },
    {
      title: t('field.actions'), key: 'actions', width: 110, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('action.detail')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/demandes/${r.id}`)} />
          </Tooltip>
          {r.statut === 'SOUMISE' && (
            <>
              <Tooltip title={t('action.validate')}>
                <Button size="small" icon={<CheckCircleOutlined />} style={{ color: '#2e7d32' }}
                  onClick={() => validerMut.mutate(r.id)} />
              </Tooltip>
              <Tooltip title={t('action.reject')}>
                <Button size="small" danger icon={<CloseCircleOutlined />}
                  onClick={() => rejeterMut.mutate({ id: r.id, motif: 'Dossier incomplet' })} />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('page.demandes')}</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => navigate('/demandes/nouvelle')}
          style={{ background: '#1a4480' }}>
          {t('action.newDemande2')}
        </Button>
      </div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder={t('placeholder.searchDmd')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 300 }} allowClear />
        <Select
          placeholder={t('placeholder.filterStatus')}
          value={statut || undefined}
          onChange={v => { setStatut(v || ''); setPage(1); }}
          allowClear style={{ width: 180 }}
          options={Object.entries(STATUT_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </Space>
      <Table
        dataSource={data?.results || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page, pageSize: 20,
          total: data?.count || 0,
          onChange: setPage,
          showTotal: total => `${total} ${t('pagination.demandes')}`,
        }}
        size="small"
        rowClassName={r => r.statut === 'SOUMISE' ? 'ant-table-row-soumise' : ''}
      />
    </div>
  );
};

export default ListeDemandes;

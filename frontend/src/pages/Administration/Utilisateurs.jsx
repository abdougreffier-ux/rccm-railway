import React, { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Switch } from 'antd';
import { PlusOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { utilisateurAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const Utilisateurs = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form]      = Form.useForm();
  const queryClient = useQueryClient();
  const { t, field } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['utilisateurs'],
    queryFn:  () => utilisateurAPI.list().then(r => r.data),
  });
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn:  () => utilisateurAPI.roles().then(r => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? utilisateurAPI.update(editing.id, d) : utilisateurAPI.create(d),
    onSuccess: () => { message.success(t('msg.saved')); setModalOpen(false); queryClient.invalidateQueries({ queryKey: ['utilisateurs'] }); },
    onError:   (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, actif }) => actif ? utilisateurAPI.desactiver(id) : utilisateurAPI.activer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['utilisateurs'] }),
    onError:   (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const resetMut = useMutation({
    mutationFn: (id) => utilisateurAPI.resetPassword(id),
    onSuccess: () => message.success(t('msg.passwordReset')),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit   = (u)  => { setEditing(u); form.setFieldsValue({ ...u, role: u.role?.id }); setModalOpen(true); };

  const roleOptions = (rolesData?.results || rolesData || []).map(r => ({ value: r.id, label: field(r, 'libelle') || r.libelle }));

  const columns = [
    { title: t('field.matricule'), dataIndex: 'matricule',   key: 'mat',    width: 110 },
    { title: t('field.nom'),       dataIndex: 'nom',         key: 'nom',    sorter: true },
    { title: t('field.prenom'),    dataIndex: 'prenom',      key: 'prenom' },
    { title: t('field.login'),     dataIndex: 'login',       key: 'login' },
    { title: t('field.email'),     dataIndex: 'email',       key: 'email',  ellipsis: true },
    { title: t('field.role'),      dataIndex: 'role_libelle',key: 'role',   render: v => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: t('field.actif'),     dataIndex: 'actif',       key: 'actif',  width: 70,
      render: (v, r) => <Switch checked={v} size="small" onChange={() => toggleMut.mutate({ id: r.id, actif: v })} /> },
    {
      title: t('field.actions'), key: 'actions', width: 110, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('action.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Tooltip title={t('action.resetPassword')}>
            <Popconfirm title={t('confirm.resetPassword')} onConfirm={() => resetMut.mutate(r.id)}
              okText={t('common.yes')} cancelText={t('common.no')}>
              <Button size="small" icon={<LockOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('page.utilisateurs')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#1a4480' }}>
          {t('action.newUser')}
        </Button>
      </div>

      <Table
        dataSource={data?.results || data || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 20, showTotal: total => `${total} ${t('pagination.users')}` }}
        size="small"
      />

      <Modal
        title={editing ? t('modal.editUser') : t('modal.newUser')}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saveMut.isPending}
        okText={t('action.save')}
        cancelText={t('action.cancel')}
      >
        <Form form={form} layout="vertical" onFinish={saveMut.mutate}>
          <Form.Item name="nom"       label={t('field.nom')}     rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="prenom"    label={t('field.prenom')}><Input /></Form.Item>
          <Form.Item name="login"     label={t('field.login')}   rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          {!editing && (
            <Form.Item name="password" label={t('auth.password')} rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="email"     label={t('field.email')}><Input type="email" /></Form.Item>
          <Form.Item name="telephone" label={t('field.telephone')}><Input /></Form.Item>
          <Form.Item name="role"      label={t('field.role')}    rules={[{ required: true }]}>
            <Select options={roleOptions} placeholder={t('placeholder.selectRole')} />
          </Form.Item>
          <Form.Item name="matricule" label={t('field.matricule')}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Utilisateurs;

import React, { useState } from 'react';
import {
  Table, Button, Tag, Typography, Tabs, Modal, Form, Input, Select,
  message, Tooltip, InputNumber, Space, Spin,
} from 'antd';
import { PlusOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parametrageAPI } from '../../api/api';
import PAYS from '../../data/pays';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

// ── Onglet générique CRUD ─────────────────────────────────────────────────────
const ParamTab = ({ queryKey, queryFn, createFn, updateFn, columns, formFields, title }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form]      = Form.useForm();
  const queryClient = useQueryClient();
  const { t }       = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn:  () => queryFn().then(r => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? updateFn(editing.id, d) : createFn(d),
    onSuccess: () => {
      message.success(t('msg.saved'));
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit   = (row) => { setEditing(row); form.setFieldsValue(row); setModalOpen(true); };

  const tableColumns = [
    ...columns,
    {
      title: t('field.actions'), key: 'actions', width: 80, fixed: 'right',
      render: (_, r) => (
        <Tooltip title={t('action.edit')}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#1a4480' }}>
          {t('action.add')}
        </Button>
      </div>

      <Table
        dataSource={data?.results || data || []}
        columns={tableColumns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 15, showTotal: (total) => `${total} ${t('common.records')}`, showSizeChanger: false }}
      />

      <Modal
        title={editing ? `${t('action.edit')} — ${title}` : `${t('common.new')} — ${title}`}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saveMut.isPending}
        okText={t('action.save')}
        cancelText={t('action.cancel')}
      >
        <Form form={form} layout="vertical" onFinish={saveMut.mutate}>
          {typeof formFields === 'function' ? formFields(form) : formFields}
        </Form>
      </Modal>
    </div>
  );
};

// ── Formulaire Nationalité avec auto-complétion pays ──────────────────────────
const NationaliteForm = ({ form }) => {
  const { t, field } = useLanguage();

  const paysOptions = PAYS.map(p => ({
    value: p.code,
    label: `${p.code} – ${field(p, 'libelle')}`,
    ...p,
  }));

  const onSelect = (value) => {
    const pays = PAYS.find(p => p.code === value);
    if (pays) {
      form.setFieldsValue({ code: pays.code, libelle_fr: pays.libelle_fr, libelle_ar: pays.libelle_ar });
    }
  };

  return (
    <>
      <Form.Item name="code" label={t('param.code')} rules={[{ required: true }]}>
        <Select
          showSearch
          placeholder="Rechercher un pays…"
          onSelect={onSelect}
          filterOption={(input, option) =>
            option.label.toLowerCase().includes(input.toLowerCase()) ||
            option.libelle_ar?.includes(input)
          }
          options={paysOptions}
        />
      </Form.Item>
      <Form.Item name="libelle_fr" label={t('param.libelle_fr')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="libelle_ar" label={t('param.libelle_ar')}>
        <Input dir="rtl" />
      </Form.Item>
    </>
  );
};

// ── Onglet Signataires ────────────────────────────────────────────────────────
const SignatairesTab = () => {
  const { t } = useLanguage();
  return (
    <ParamTab
      title={t('param.signataires')}
      queryKey="signataires-admin"
      queryFn={parametrageAPI.signataires}
      createFn={(d) => parametrageAPI.createSignataire(d)}
      updateFn={(id, d) => parametrageAPI.updateSignataire(id, d)}
      columns={[
        { title: t('field.nomFr'),  dataIndex: 'nom',        key: 'nom',      ellipsis: true },
        { title: 'Qualité (FR)',    dataIndex: 'qualite',    key: 'qualite',  ellipsis: true },
        { title: t('field.nomAr'), dataIndex: 'nom_ar',     key: 'nom_ar',   className: 'rtl' },
        { title: 'Qualité (AR)',   dataIndex: 'qualite_ar', key: 'qualite_ar', className: 'rtl' },
        {
          title: t('param.actif'), dataIndex: 'actif', key: 'actif', width: 70,
          render: v => <Tag color={v ? 'success' : 'default'}>{v ? t('common.yes') : t('common.no')}</Tag>,
        },
      ]}
      formFields={
        <>
          <Form.Item name="nom"        label={`${t('field.nom')} (FR)`}   rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nom_ar"     label={t('field.nomAr')}><Input dir="rtl" /></Form.Item>
          <Form.Item name="qualite"    label="Qualité / Titre (FR)"        rules={[{ required: true }]}><Input placeholder="Ex: Greffier en chef" /></Form.Item>
          <Form.Item name="qualite_ar" label="Qualité / Titre (AR)"><Input dir="rtl" /></Form.Item>
        </>
      }
    />
  );
};

// ── Onglet Numérotation ───────────────────────────────────────────────────────
const NumerotationTab = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['numerotation-admin'],
    queryFn:  () => parametrageAPI.numerotation().then(r => r.data),
  });

  const [editValues, setEditValues] = useState({});

  const updateMut = useMutation({
    mutationFn: ({ code, val }) => parametrageAPI.updateNumerotation(code, { dernier_num: val }),
    onSuccess: (_, { code }) => {
      message.success(`N° « ${code} » ${t('msg.saved')}`);
      queryClient.invalidateQueries({ queryKey: ['numerotation-admin'] });
      setEditValues(v => { const c = { ...v }; delete c[code]; return c; });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  if (isLoading) return <Spin />;

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('param.numerotation_info')}
      </Text>

      <Table
        dataSource={data || []}
        rowKey="code"
        size="small"
        pagination={false}
        columns={[
          { title: t('param.code'),    dataIndex: 'code',    key: 'code',  width: 80, render: v => <Tag>{v}</Tag> },
          { title: 'Libellé',          dataIndex: 'libelle', key: 'libelle', ellipsis: true },
          { title: 'Année',            dataIndex: 'annee',   key: 'annee',  width: 80,
            render: v => v === 0 ? <Text type="secondary">—</Text> : v },
          {
            title: 'Dernier N°', dataIndex: 'dernier_num', key: 'dernier_num', width: 140,
            render: (v, r) => (
              <InputNumber
                value={editValues[r.code] !== undefined ? editValues[r.code] : v}
                min={0}
                step={r.code === 'RA' ? 2 : 1}
                onChange={val => setEditValues(prev => ({ ...prev, [r.code]: val }))}
                style={{ width: 110 }}
              />
            ),
          },
          {
            title: 'Dernière modif.', dataIndex: 'updated_at', key: 'updated_at', width: 170,
            render: v => v ? new Date(v).toLocaleString('fr-FR') : '—',
          },
          {
            title: t('field.actions'), key: 'action', width: 100,
            render: (_, r) => {
              const newVal  = editValues[r.code];
              const changed = newVal !== undefined && newVal !== r.dernier_num;
              return (
                <Button
                  size="small"
                  type="primary"
                  icon={<SaveOutlined />}
                  disabled={!changed}
                  loading={updateMut.isPending}
                  onClick={() => updateMut.mutate({ code: r.code, val: newVal })}
                  style={{ background: changed ? '#1a4480' : undefined }}
                >
                  {t('action.save')}
                </Button>
              );
            },
          },
        ]}
      />
    </div>
  );
};

// ── Page Paramétrage ──────────────────────────────────────────────────────────
const Parametrage = () => {
  const { t } = useLanguage();

  const tabItems = [
    {
      key: 'nationalites',
      label: t('param.nationalites'),
      children: (
        <ParamTab
          title={t('param.nationalites')}
          queryKey="nationalites-admin"
          queryFn={parametrageAPI.nationalites}
          createFn={(d) => parametrageAPI.createNationalite(d)}
          updateFn={(id, d) => parametrageAPI.updateNationalite(id, d)}
          columns={[
            { title: t('param.code'),      dataIndex: 'code',       key: 'code',       width: 80 },
            { title: t('param.libelle_fr'),dataIndex: 'libelle_fr', key: 'libelle_fr', sorter: true },
            { title: t('param.libelle_ar'),dataIndex: 'libelle_ar', key: 'libelle_ar' },
          ]}
          formFields={(form) => <NationaliteForm form={form} />}
        />
      ),
    },
    {
      key: 'formes-juridiques',
      label: t('param.formes'),
      children: (
        <ParamTab
          title={t('param.formes')}
          queryKey="formes-juridiques-admin"
          queryFn={parametrageAPI.formesJuridiques}
          createFn={(d) => parametrageAPI.createFormeJuridique(d)}
          updateFn={(id, d) => parametrageAPI.updateFormeJuridique(id, d)}
          columns={[
            { title: t('param.code'),      dataIndex: 'code',       key: 'code',       width: 80 },
            { title: t('param.libelle_fr'),dataIndex: 'libelle_fr', key: 'libelle_fr', sorter: true },
            { title: t('param.libelle_ar'),dataIndex: 'libelle_ar', key: 'libelle_ar' },
          ]}
          formFields={
            <>
              <Form.Item name="code"       label={t('param.code')}       rules={[{ required: true }]}><Input placeholder="Ex: SARL" /></Form.Item>
              <Form.Item name="libelle_fr" label={t('param.libelle_fr')} rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_ar" label={t('param.libelle_ar')}><Input dir="rtl" /></Form.Item>
            </>
          }
        />
      ),
    },
    {
      key: 'domaines',
      label: t('param.domaines'),
      children: (
        <ParamTab
          title={t('param.domaines')}
          queryKey="domaines-admin"
          queryFn={parametrageAPI.domaines}
          createFn={(d) => parametrageAPI.createDomaine(d)}
          updateFn={(id, d) => parametrageAPI.updateDomaine(id, d)}
          columns={[
            { title: t('param.code'),      dataIndex: 'code',       key: 'code',       width: 80 },
            { title: t('param.libelle_fr'),dataIndex: 'libelle_fr', key: 'libelle_fr', sorter: true },
            { title: t('param.libelle_ar'),dataIndex: 'libelle_ar', key: 'libelle_ar' },
          ]}
          formFields={
            <>
              <Form.Item name="code"       label={t('param.code')}       rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_fr" label={t('param.libelle_fr')} rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_ar" label={t('param.libelle_ar')}><Input dir="rtl" /></Form.Item>
            </>
          }
        />
      ),
    },
    {
      key: 'fonctions',
      label: t('param.fonctions'),
      children: (
        <ParamTab
          title={t('param.fonctions')}
          queryKey="fonctions-admin"
          queryFn={parametrageAPI.fonctions}
          createFn={(d) => parametrageAPI.createFonction(d)}
          updateFn={(id, d) => parametrageAPI.updateFonction(id, d)}
          columns={[
            { title: t('param.code'),      dataIndex: 'code',       key: 'code',       width: 80 },
            { title: t('param.libelle_fr'),dataIndex: 'libelle_fr', key: 'libelle_fr', sorter: true },
            { title: t('param.libelle_ar'),dataIndex: 'libelle_ar', key: 'libelle_ar' },
          ]}
          formFields={
            <>
              <Form.Item name="code"       label={t('param.code')}       rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_fr" label={t('param.libelle_fr')} rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_ar" label={t('param.libelle_ar')}><Input dir="rtl" /></Form.Item>
            </>
          }
        />
      ),
    },
    {
      key: 'types-documents',
      label: t('param.types_docs'),
      children: (
        <ParamTab
          title={t('param.types_docs')}
          queryKey="types-documents-admin"
          queryFn={parametrageAPI.typesDocuments}
          createFn={(d) => parametrageAPI.createTypeDocument(d)}
          updateFn={(id, d) => parametrageAPI.updateTypeDocument(id, d)}
          columns={[
            { title: t('param.code'),      dataIndex: 'code',       key: 'code',       width: 100 },
            { title: t('param.libelle_fr'),dataIndex: 'libelle_fr', key: 'libelle_fr', sorter: true },
            { title: t('param.libelle_ar'),dataIndex: 'libelle_ar', key: 'libelle_ar' },
            {
              title: t('param.obligatoire'), dataIndex: 'obligatoire', key: 'obligatoire', width: 120,
              render: v => <Tag color={v ? 'red' : 'default'}>{v ? t('common.yes') : t('common.no')}</Tag>,
            },
          ]}
          formFields={
            <>
              <Form.Item name="code"       label={t('param.code')}       rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_fr" label={t('param.libelle_fr')} rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="libelle_ar" label={t('param.libelle_ar')}><Input dir="rtl" /></Form.Item>
            </>
          }
        />
      ),
    },
    {
      key: 'signataires',
      label: t('param.signataires'),
      children: <SignatairesTab />,
    },
    {
      key: 'numerotation',
      label: t('param.numerotation'),
      children: <NumerotationTab />,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>{t('param.title')}</Title>
      <Tabs defaultActiveKey="nationalites" items={tabItems} type="card" />
    </div>
  );
};

export default Parametrage;

import React, { useState, useEffect } from 'react';
import {
  Form, Input, Select, DatePicker, Card, Button, Table,
  Modal, Typography, Space, Row, Col, Tooltip, InputNumber,
  message, Spin, Alert, Descriptions, Tag,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined,
  ArrowLeftOutlined, SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { rbeAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import dayjs from 'dayjs';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title, Text } = Typography;
const { TextArea } = Input;

// Helpers décimaux bilingues (FR virgule ↔ interne point)
const pctFormatter = v =>
  (v !== undefined && v !== null && v !== '') ? String(v).replace('.', ',') : '';
const pctParser = v => {
  if (!v) return undefined;
  const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
};

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_ATTENTE:  'processing',
  RETOURNE:    'warning',
  VALIDE:      'success',
  MODIFIE:     'cyan',
  RADIE:       'error',
};

const NATURE_CONTROLE_OPTIONS = [
  { value: 'PARTICIPATION_DIRECTE',   label: 'Participation directe (actions/parts)' },
  { value: 'PARTICIPATION_INDIRECTE', label: 'Participation indirecte' },
  { value: 'CONTROLE_DIRECTION',      label: 'Contrôle de direction' },
  { value: 'REPRESENTANT_LEGAL',      label: 'Représentant légal' },
  { value: 'BENEFICIAIRE_BIENS',      label: 'Bénéficiaire des biens' },
  { value: 'CONTROLE_ULTIME',         label: 'Contrôle en dernier ressort' },
  { value: 'AUTRE',                   label: 'Autre' },
];

const TYPE_DOC_OPTIONS = [
  { value: 'NNI',       label: 'NNI' },
  { value: 'PASSEPORT', label: 'Passeport' },
  { value: 'AUTRE',     label: 'Autre' },
];

// ── Table bénéficiaires éditable ─────────────────────────────────────────────
const BeneficiairesEditable = ({ rows, setRows, nationalites, isAr }) => {
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(null);
  const [form]    = Form.useForm();

  const openAdd  = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      date_naissance:   row.date_naissance   ? dayjs(row.date_naissance)   : null,
      date_prise_effet: row.date_prise_effet  ? dayjs(row.date_prise_effet) : null,
    });
    setOpen(true);
  };
  const handleDelete = (key) => setRows(prev => prev.filter(r => r._key !== key));

  const handleOk = () => {
    form.validateFields().then(vals => {
      const processed = {
        ...vals,
        date_naissance:   vals.date_naissance   ? dayjs(vals.date_naissance).format('YYYY-MM-DD')   : null,
        date_prise_effet: vals.date_prise_effet  ? dayjs(vals.date_prise_effet).format('YYYY-MM-DD') : null,
      };
      if (editing) {
        setRows(prev => prev.map(r => r._key === editing._key ? { ...r, ...processed } : r));
      } else {
        setRows(prev => [...prev, { ...processed, _key: Date.now() }]);
      }
      setOpen(false);
    });
  };

  const natLabel = (id) => {
    const n = nationalites.find(x => x.id === id);
    return n ? (isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr) : (id || '—');
  };

  const natureLabel = (val) => {
    const opt = NATURE_CONTROLE_OPTIONS.find(o => o.value === val);
    return opt ? opt.label : (val || '—');
  };

  const columns = [
    {
      title: 'Nom / Prénom', key: 'nom_prenom',
      render: (_, r) => <span><strong>{r.nom}</strong>{r.prenom ? ' ' + r.prenom : ''}</span>,
    },
    { title: 'Nationalité',     key: 'nat',    render: (_, r) => natLabel(r.nationalite) },
    { title: 'Nature contrôle', key: 'nature', render: (_, r) => natureLabel(r.nature_controle), ellipsis: true },
    { title: '% Détention',     dataIndex: 'pourcentage_detention', key: 'pct', width: 110, render: v => v ? `${v}%` : '—' },
    {
      title: 'Actions', key: 'act', width: 90, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title="Modifier"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title="Supprimer"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r._key)} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={<Text strong>Bénéficiaires effectifs</Text>}
      extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ background: '#1a4480' }}>Ajouter</Button>}
      style={{ marginBottom: 16 }}
    >
      {rows.length === 0 && (
        <div style={{ color: '#999', padding: '8px 0', marginBottom: 8 }}>
          Aucun bénéficiaire. Ajoutez au moins un bénéficiaire.
        </div>
      )}
      {rows.length > 0 && (
        <Table dataSource={rows} columns={columns} rowKey="_key" size="small" pagination={false} scroll={{ x: 'max-content' }} style={{ marginBottom: 8 }} />
      )}

      <Modal
        title={editing ? 'Modifier le bénéficiaire' : 'Ajouter un bénéficiaire'}
        open={open}
        onOk={handleOk}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        width={760} okText="Confirmer" cancelText="Annuler" destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="nom" label="Nom (FR)" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="prenom" label="Prénom"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="nom_ar" label="Nom (AR)"><Input dir="rtl" /></Form.Item></Col>
            <Col span={12}><Form.Item name="prenom_ar" label="Prénom (AR)"><Input dir="rtl" /></Form.Item></Col>
            <Col span={12}><Form.Item name="date_naissance" label="Date de naissance"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col span={12}><Form.Item name="lieu_naissance" label="Lieu de naissance"><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="nationalite" label="Nationalité">
                <Select showSearch options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type_document" label="Type de document"><Select options={TYPE_DOC_OPTIONS} /></Form.Item>
            </Col>
            <Col span={12}><Form.Item name="numero_document" label="N° document" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="telephone" label="Téléphone"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="adresse" label="Adresse"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="nature_controle" label="Nature du contrôle" rules={[{ required: true }]}>
                <Select options={NATURE_CONTROLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pourcentage_detention" label="% de détention">
                <InputNumber
                  min={0} max={100} step={0.01} precision={2}
                  style={{ width: '100%' }} addonAfter="%"
                  formatter={pctFormatter}
                  parser={pctParser}
                />
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="date_prise_effet" label="Date de prise d'effet"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

// ── Page principale ───────────────────────────────────────────────────────────
const FormulaireModificationRBE = () => {
  const { id }  = useParams();
  const navigate = useNavigate();
  const { t, isAr } = useLanguage();
  const [form]  = Form.useForm();
  const [beneficiaires, setBeneficiaires] = useState([]);

  // ── Données déclaration d'origine ────────────────────────────────────────────
  const { data: rbe, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rbe-detail', id],
    queryFn:  () => rbeAPI.get(id).then(r => r.data),
  });

  // Pré-remplir les bénéficiaires depuis la déclaration d'origine
  useEffect(() => {
    if (rbe?.beneficiaires?.length > 0 && beneficiaires.length === 0) {
      setBeneficiaires(
        rbe.beneficiaires.map(b => ({ ...b, _key: b.id || Date.now() + Math.random() }))
      );
    }
  }, [rbe]);

  // ── Nationalités ─────────────────────────────────────────────────────────────
  const { data: nationalitesData = [] } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []),
  });

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const modifMut = useMutation({
    mutationFn: (data) => rbeAPI.modifier(id, data),
    onSuccess: (res) => {
      message.success(t('msg.saved'));
      navigate(`/registres/rbe/${res.data.id}`);
    },
    onError: (e) => {
      const err = e.response?.data;
      message.error(typeof err === 'string' ? err : err?.detail || t('msg.error'));
    },
  });

  const handleSubmit = () => {
    if (beneficiaires.length === 0) {
      message.error('Veuillez ajouter au moins un bénéficiaire effectif.');
      return;
    }
    form.validateFields().then(vals => {
      const processedBens = beneficiaires.map(b => {
        const { _key, ...rest } = b;
        return rest;
      });
      modifMut.mutate({
        ...vals,
        beneficiaires: processedBens,
      });
    });
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!rbe)      return <AccessDenied onRetry={refetch} style="inline" />;

  const STATUT_LABELS = {
    BROUILLON: 'Brouillon', EN_ATTENTE: 'En attente', RETOURNE: 'Retourné',
    VALIDE: 'Validé', MODIFIE: 'Modifié', RADIE: 'Radié',
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/registres/rbe/${id}`)}>
          {t('common.back')}
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          ✏️ {t('rbe.modifier')} — {rbe.numero_rbe}
        </Title>
      </div>

      {/* ── En-tête déclaration d'origine ─────────────────────────────────────── */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Modification de déclaration RBE"
        description="Vous allez créer une nouvelle déclaration de type MODIFICATION. La déclaration d'origine restera consultable."
      />

      <Card title="Déclaration d'origine (lecture seule)" style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="N° RBE" span={1}><strong>{rbe.numero_rbe}</strong></Descriptions.Item>
          <Descriptions.Item label="Statut" span={1}>
            <Tag color={STATUT_COLOR[rbe.statut]}>{STATUT_LABELS[rbe.statut] || rbe.statut}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Type d'entité" span={1}>{rbe.type_entite}</Descriptions.Item>
          <Descriptions.Item label="Dénomination" span={1}>{rbe.denomination || rbe.denomination_entite}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Form form={form} layout="vertical">

        {/* ── Bénéficiaires effectifs ─────────────────────────────────────────── */}
        <Card title="Bénéficiaires effectifs modifiés" style={{ marginBottom: 16 }}>
          <BeneficiairesEditable
            rows={beneficiaires}
            setRows={setBeneficiaires}
            nationalites={nationalitesData}
            isAr={isAr}
          />
        </Card>

        {/* ── Motif ────────────────────────────────────────────────────────────── */}
        <Card title="Motif de modification" style={{ marginBottom: 16 }}>
          <Form.Item
            name="motif"
            label="Motif"
            rules={[{ required: true, message: 'Le motif de modification est requis' }]}
          >
            <TextArea rows={3} placeholder="Décrivez les raisons de cette modification…" />
          </Form.Item>
        </Card>

        {/* ── Observations ─────────────────────────────────────────────────────── */}
        <Card title={t('field.observations')} style={{ marginBottom: 24 }}>
          <Form.Item name="observations">
            <TextArea rows={2} placeholder={t('placeholder.observations')} />
          </Form.Item>
        </Card>

        {/* ── Boutons ───────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={() => navigate(`/registres/rbe/${id}`)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={modifMut.isPending}
            onClick={handleSubmit}
            style={{ background: '#1a4480' }}
          >
            Créer la modification
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default FormulaireModificationRBE;

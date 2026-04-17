import React, { useState } from 'react';
import {
  Form, Input, Select, DatePicker, Card, Button, Table,
  Modal, Typography, Space, Row, Col, Radio, Alert,
  InputNumber, message, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined,
  ArrowLeftOutlined, SendOutlined, BankOutlined, ShopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rbeAPI, registreAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { getCiviliteOptions } from '../../utils/civilite';
import { uppercaseRule } from '../../components/NniInput';
import dayjs from 'dayjs';

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

// ── Choix d'entité ────────────────────────────────────────────────────────────
const TYPE_ENTITE_OPTIONS = [
  { value: 'SOCIETE',      label: 'Société commerciale' },
  { value: 'SUCCURSALE',   label: 'Succursale de société étrangère' },
  { value: 'ASSOCIATION',  label: 'Association' },
  { value: 'ONG',          label: 'ONG' },
  { value: 'FONDATION',    label: 'Fondation' },
  { value: 'FIDUCIE',      label: 'Fiducie / Construction juridique' },
];

const AUTORITE_OPTIONS = [
  { value: 'RC',        label: 'Registre du Commerce' },
  { value: 'MINISTERE', label: 'Ministère' },
  { value: 'TRIBUNAL',  label: 'Tribunal' },
  { value: 'AUTRE',     label: 'Autre autorité' },
];

const TYPE_DOC_OPTIONS = [
  { value: 'NNI',       label: 'NNI' },
  { value: 'PASSEPORT', label: 'Passeport' },
  { value: 'AUTRE',     label: 'Autre' },
];

// ── Nature de contrôle dynamique par type d'entité ────────────────────────────
const NATURE_CONTROLE_ALL = [
  { value: 'DETENTION_DIRECTE',      label: 'Détention directe (≥ 20 % des parts / droits de vote)',  types: ['SOCIETE','SUCCURSALE'] },
  { value: 'DETENTION_INDIRECTE',    label: 'Détention indirecte',                                      types: ['SOCIETE','SUCCURSALE'] },
  { value: 'CONTROLE',               label: 'Contrôle (autre mécanisme)',                               types: ['SOCIETE','SUCCURSALE'] },
  { value: 'DIRIGEANT_PAR_DEFAUT',   label: 'Dirigeant par défaut (aucun autre BE identifié)',          types: ['SOCIETE','SUCCURSALE','ASSOCIATION','ONG','FONDATION','FIDUCIE'] },
  { value: 'BENEFICIAIRE_BIENS',     label: 'Bénéficiaire des biens (≥ 20 %)',                          types: ['ASSOCIATION','ONG'] },
  { value: 'GROUPE_BENEFICIAIRE',    label: 'Appartenance à un groupe de bénéficiaires',                types: ['ASSOCIATION','ONG'] },
  { value: 'CONTROLEUR_ASSO',        label: "Contrôleur de l'association",                              types: ['ASSOCIATION','ONG'] },
  { value: 'BENEFICIAIRE_ACTUEL',    label: 'Bénéficiaire actuel de la fiducie',                        types: ['FIDUCIE'] },
  { value: 'BENEFICIAIRE_CATEGORIE', label: 'Appartenance à une catégorie de bénéficiaires',            types: ['FIDUCIE'] },
  { value: 'CONTROLEUR_FINAL',       label: 'Contrôleur final de la fiducie',                           types: ['FIDUCIE'] },
  { value: 'CONTROLE_DERNIER_RESSORT', label: 'Contrôle en dernier ressort (fondation)',                types: ['FONDATION'] },
  { value: 'REPRESENTANT_LEGAL',     label: 'Représentant légal',                                       types: ['SOCIETE','SUCCURSALE','ASSOCIATION','ONG','FONDATION','FIDUCIE'] },
  { value: 'AUTRE',                  label: 'Autre',                                                    types: ['SOCIETE','SUCCURSALE','ASSOCIATION','ONG','FONDATION','FIDUCIE'] },
];

const getNatureOptions = (typeEntite) =>
  typeEntite
    ? NATURE_CONTROLE_ALL.filter(o => o.types.includes(typeEntite))
    : NATURE_CONTROLE_ALL;


// ── Sous-composant table bénéficiaires éditable ───────────────────────────────
const BeneficiairesEditable = ({ rows, setRows, nationalites, isAr, typeEntite }) => {
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(null);
  const [form]    = Form.useForm();
  const natureOpts = getNatureOptions(typeEntite);

  const openAdd = () => { setEditing(null); form.resetFields(); setOpen(true); };
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
    return n ? (isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr) : id;
  };

  const natureLabel = (val) => {
    const opt = NATURE_CONTROLE_ALL.find(o => o.value === val);
    return opt ? opt.label : val;
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
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r._key)} />
        </Space>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={<Text strong>Bénéficiaires effectifs</Text>}
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}
          style={{ background: '#1a4480' }}>
          Ajouter
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      {rows.length === 0 && (
        <div style={{ color: '#999', padding: '8px 0', marginBottom: 8 }}>
          Aucun bénéficiaire. Ajoutez au moins un bénéficiaire effectif.
        </div>
      )}
      {rows.length > 0 && (
        <Table dataSource={rows} columns={columns} rowKey="_key"
          size="small" pagination={false} scroll={{ x: 'max-content' }} style={{ marginBottom: 8 }} />
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
            <Col span={8}>
              <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
                <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nom" label="Nom (FR)" rules={[{ required: true }, uppercaseRule(isAr)]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="prenom" label="Prénom">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nom_ar" label="Nom (AR)">
                <Input dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="prenom_ar" label="Prénom (AR)">
                <Input dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date_naissance" label="Date de naissance">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lieu_naissance" label="Lieu de naissance">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nationalite" label="Nationalité">
                <Select showSearch
                  options={nationalites.map(n => ({
                    value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type_document" label="Type de document">
                <Select options={TYPE_DOC_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="numero_document" label="N° document" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="telephone" label="Téléphone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="adresse" label="Adresse">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="domicile" label="Domicile">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nature_controle" label="Nature du contrôle" rules={[{ required: true }]}>
                <Select options={natureOpts} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nature_controle_detail" label="Précision (optionnel)">
                <Input placeholder="Détails complémentaires…" />
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
            <Col span={12}>
              <Form.Item name="date_prise_effet" label="Date de prise d'effet">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};


// ── Page principale ───────────────────────────────────────────────────────────
const FormulaireRBE = () => {
  const [searchParams]  = useSearchParams();
  const initSource      = searchParams.get('source') || 'RC';  // RC | HORS_RC

  const [beneficiaires, setBeneficiaires] = useState([]);
  const [source,        setSource]        = useState(initSource);
  const [typeEntite,    setTypeEntite]    = useState('');
  const [modeDecl,      setModeDecl]      = useState('IMMEDIATE');
  const [raSearch,      setRaSearch]      = useState('');
  const [form]     = Form.useForm();
  const [entiteForm] = Form.useForm();
  const navigate   = useNavigate();
  const { t, isAr, field } = useLanguage();

  // ── Paramétrage ──────────────────────────────────────────────────────────────
  const { data: nationalitesData = [] } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []),
  });
  const { data: localitesData = [] } = useQuery({
    queryKey: ['localites'],
    queryFn:  () => parametrageAPI.localites().then(r => r.data?.results || r.data || []),
  });

  // ── Recherche RA (pour source RC) ────────────────────────────────────────────
  const { data: raData } = useQuery({
    queryKey: ['ra-search', raSearch],
    queryFn:  () => registreAPI.listRA({ search: raSearch, statut: 'IMMATRICULE', page_size: 30 }).then(r => r.data),
    enabled:  source === 'RC' && raSearch.length > 1,
  });
  const raOptions = (raData?.results || []).map(ra => ({
    value: ra.id,
    label: `${ra.numero_ra} — ${ra.denomination || ''}`,
    denomination: ra.denomination,
    denomination_ar: ra.denomination_ar,
  }));

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createEntiteMut = useMutation({
    mutationFn: (data) => rbeAPI.createEntite(data),
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const createMut = useMutation({
    mutationFn: (data) => rbeAPI.create(data),
    onError: (e) => {
      const err = e.response?.data;
      message.error(typeof err === 'string' ? err : err?.detail || t('msg.error'));
    },
  });

  const envoyerMut = useMutation({
    mutationFn: (id) => rbeAPI.envoyer(id),
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Construction du payload ───────────────────────────────────────────────────
  const buildPayload = async (values) => {
    const processed = beneficiaires.map(({ _key, ...rest }) => rest);
    let entiteId = null;

    // Pour hors RC : créer l'EntiteJuridique d'abord
    if (source === 'HORS_RC') {
      const entiteVals = entiteForm.getFieldsValue(true);
      const entiteRes  = await createEntiteMut.mutateAsync({
        ...entiteVals,
        source_entite: 'HORS_RC',
        type_entite:   typeEntite,
        date_creation: entiteVals.date_creation
          ? dayjs(entiteVals.date_creation).format('YYYY-MM-DD')
          : null,
      });
      entiteId = entiteRes.data.id;
    }

    return {
      ...values,
      type_entite:       typeEntite,
      type_declaration:  'INITIALE',
      mode_declaration:  modeDecl,
      date_declaration:  values.date_declaration
        ? dayjs(values.date_declaration).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD'),
      ...(entiteId ? { entite: entiteId } : {}),
      beneficiaires: processed,
    };
  };

  const handleSaveDraft = () => {
    if (!typeEntite) { message.error("Veuillez sélectionner le type d'entité."); return; }
    form.validateFields(['denomination_entite', 'declarant_nom']).then(async () => {
      const values  = form.getFieldsValue(true);
      const payload = await buildPayload(values);
      try {
        const res = await createMut.mutateAsync(payload);
        message.success(t('msg.saved'));
        navigate(`/registres/rbe/${res.data.id}`);
      } catch {}
    });
  };

  const handleSendToGreffe = () => {
    if (!typeEntite) { message.error("Veuillez sélectionner le type d'entité."); return; }
    if (modeDecl === 'IMMEDIATE' && beneficiaires.length === 0) {
      message.error('Veuillez ajouter au moins un bénéficiaire effectif.');
      return;
    }
    form.validateFields().then(async () => {
      const values  = form.getFieldsValue(true);
      const payload = await buildPayload(values);
      try {
        const res = await createMut.mutateAsync(payload);
        await envoyerMut.mutateAsync(res.data.id);
        message.success(t('msg.dossiereEnvoye'));
        navigate(`/registres/rbe/${res.data.id}`);
      } catch {}
    });
  };

  const handleRASelect = (raId, option) => {
    if (option?.denomination) {
      form.setFieldValue('denomination_entite',    option.denomination);
      form.setFieldValue('denomination_entite_ar', option.denomination_ar || '');
    }
  };

  const isRC    = source === 'RC';
  const isLoading = createMut.isPending || envoyerMut.isPending || createEntiteMut.isPending;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/registres/rbe')}>
          {t('common.back')}
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          📋 {t('rbe.new') || 'Nouvelle déclaration RBE'} — Initiale
        </Title>
      </div>

      {/* ── 0. Source de l'entité ─────────────────────────────────────────────── */}
      <Card
        title="0 — Source de l'entité"
        style={{ marginBottom: 16 }}
        styles={{ header: { background: '#f0f5ff' } }}
      >
        <Radio.Group
          value={source}
          onChange={e => setSource(e.target.value)}
          size="large"
        >
          <Radio.Button value="RC">
            <BankOutlined /> Entité inscrite au Registre du Commerce (RC)
          </Radio.Button>
          <Radio.Button value="HORS_RC">
            <ShopOutlined /> Entité hors Registre du Commerce (Association, ONG, Fondation, Fiducie…)
          </Radio.Button>
        </Radio.Group>
      </Card>

      {/* ── 1. Type d'entité + Mode de déclaration ───────────────────────────── */}
      <Card title="1 — Type d'entité et mode de déclaration" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Type d'entité" required>
              <Select
                value={typeEntite || undefined}
                onChange={v => setTypeEntite(v)}
                options={TYPE_ENTITE_OPTIONS}
                placeholder="Sélectionner le type"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Mode de déclaration" required>
              <Radio.Group value={modeDecl} onChange={e => setModeDecl(e.target.value)}>
                <Radio value="IMMEDIATE">
                  <Text strong>Déclaration immédiate</Text>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Bénéficiaires effectifs connus dès maintenant
                  </div>
                </Radio>
                <Radio value="DIFFEREE" style={{ marginTop: 8 }}>
                  <Text strong>Déclaration différée (15 jours)</Text>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Les bénéficiaires seront déclarés dans un délai de 15 jours
                  </div>
                </Radio>
              </Radio.Group>
              {modeDecl === 'DIFFEREE' && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 8 }}
                  message="Le délai de 15 jours est calculé à partir de la date de déclaration. Tout dépassement entraîne un passage en statut EN RETARD."
                />
              )}
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* ── 2a. Liaison RC ────────────────────────────────────────────────────── */}
      {isRC && (
        <Card title="2 — Liaison avec le Registre analytique (RC)" style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="ra" label="Registre analytique lié">
                  <Select
                    showSearch allowClear
                    placeholder="Rechercher par N° RA ou dénomination…"
                    filterOption={false}
                    onSearch={setRaSearch}
                    options={raOptions}
                    onSelect={handleRASelect}
                    onClear={() => setRaSearch('')}
                    notFoundContent={raSearch.length < 2 ? 'Tapez pour rechercher…' : 'Aucun résultat'}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      {/* ── 2b. Entité hors RC ────────────────────────────────────────────────── */}
      {!isRC && (
        <Card
          title="2 — Informations de l'entité hors RC"
          style={{ marginBottom: 16 }}
          styles={{ header: { background: '#f9f0ff' } }}
        >
          <Form form={entiteForm} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="denomination" label="Dénomination (FR)" rules={[{ required: true }, uppercaseRule(isAr)]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="denomination_ar" label="Dénomination (AR)">
                  <Input dir="rtl" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="autorite_enregistrement" label="Autorité d'enregistrement">
                  <Select options={AUTORITE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="numero_enregistrement" label="N° d'enregistrement">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="date_creation" label="Date de création">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="pays" label="Pays" initialValue="Mauritanie">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="siege_social" label="Siège social / Adresse">
                  <TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      {/* ── 3. Dénomination pour la déclaration ──────────────────────────────── */}
      <Form form={form} layout="vertical">
        <Card title="3 — Dénomination de l'entité dans la déclaration" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="denomination_entite" label="Dénomination (FR)" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="denomination_entite_ar" label="Dénomination (AR)">
                <Input dir="rtl" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── 4. Déclarant ─────────────────────────────────────────────────────── */}
        <Card
          title={`4 — ${isAr ? t('rbe.declarant') : 'Informations du déclarant'}`}
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="declarant_civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
                <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="declarant_nom" label={isAr ? t('declarant.nom') : 'Nom'} rules={[{ required: true }, uppercaseRule(isAr)]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="declarant_prenom" label={isAr ? t('declarant.prenom') : 'Prénom'}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="declarant_nom_ar" label={isAr ? 'الاسم (ع)' : 'Nom (AR)'}>
                <Input dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="declarant_qualite" label={isAr ? t('rbe.declarant_qualite') : 'Qualité'}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="declarant_qualite_ar" label={isAr ? 'الصفة (ع)' : 'Qualité (AR)'}>
                <Input dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="declarant_adresse" label={isAr ? t('field.adresse') : 'Adresse'}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="declarant_telephone" label={isAr ? t('field.telephone') : 'Téléphone'}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="declarant_email" label={isAr ? t('field.email') : 'Email'}>
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── 5. Date & Greffe ──────────────────────────────────────────────────── */}
        <Card title="5 — Date et greffe" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="date_declaration" label="Date de déclaration">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" defaultValue={dayjs()} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="localite" label="Greffe">
                <Select
                  showSearch
                  placeholder="Sélectionner le greffe"
                  options={localitesData.map(l => ({
                    value: l.id,
                    label: field(l, 'libelle'),
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── 6. Bénéficiaires effectifs ────────────────────────────────────────── */}
        {modeDecl === 'IMMEDIATE' && (
          <Card title="6 — Bénéficiaires effectifs" style={{ marginBottom: 16 }}>
            <BeneficiairesEditable
              rows={beneficiaires}
              setRows={setBeneficiaires}
              nationalites={nationalitesData}
              isAr={isAr}
              typeEntite={typeEntite}
            />
          </Card>
        )}

        {modeDecl === 'DIFFEREE' && (
          <Card
            title="6 — Bénéficiaires effectifs (déclaration différée)"
            style={{ marginBottom: 16 }}
          >
            <Alert
              type="info"
              showIcon
              message="Déclaration différée sélectionnée"
              description="Les bénéficiaires effectifs devront être déclarés dans les 15 jours suivant la date de déclaration. La déclaration sera enregistrée en statut EN ATTENTE."
            />
          </Card>
        )}

        {/* ── Demandeur ──────────────────────────────────────────────────────── */}
        <Card title="7 — Demandeur / مقدم الطلب" style={{ marginBottom: 24, borderLeft: '4px solid #1a4480' }}>
          <Form.Item
            name="demandeur"
            label="Demandeur / مقدم الطلب"
            rules={[{ required: true, message: 'Le demandeur est obligatoire / مقدم الطلب إلزامي' }]}
            extra="Personne qui se présente au registre — الشخص الذي يتقدم إلى السجل التجاري"
          >
            <Input placeholder="Nom complet du demandeur / الاسم الكامل لمقدم الطلب" />
          </Form.Item>
        </Card>

        {/* ── Observations ─────────────────────────────────────────────────────── */}
        <Card title="8 — Observations" style={{ marginBottom: 24 }}>
          <Form.Item name="observations">
            <TextArea rows={3} placeholder="Observations éventuelles…" />
          </Form.Item>
        </Card>

        {/* ── Boutons ───────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 32 }}>
          <Button onClick={() => navigate('/registres/rbe')}>
            {t('common.cancel')}
          </Button>
          <Button
            icon={<SaveOutlined />}
            loading={isLoading}
            onClick={handleSaveDraft}
          >
            {t('rbe.sauvegarder') || 'Enregistrer brouillon'}
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={isLoading}
            onClick={handleSendToGreffe}
            style={{ background: '#1a4480' }}
          >
            {t('rbe.sendForValidation') || 'Envoyer au greffe'}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default FormulaireRBE;

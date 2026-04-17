import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Form, Input, Select, DatePicker, InputNumber, Card, Button, Table,
  Modal, Typography, Space, Row, Col, Checkbox, Tag, Tooltip,
  Upload, Alert, Progress, message, Radio, AutoComplete, Spin,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, ArrowLeftOutlined,
  UploadOutlined, PaperClipOutlined, UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { registreAPI, parametrageAPI, documentAPI } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import { getCiviliteOptions, formatCivilite } from '../../utils/civilite';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import NniInput, { nniRule, uppercaseRule } from '../../components/NniInput';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// ── Helpers décimaux bilingues (FR virgule ↔ interne point) ───────────────────
// Problème : AntD InputNumber sans parser custom interprète "89,5" comme "895"
// puis clampe sur max=100 → bug "89,5% → 100%".
// Solution : parser/formatter personnalisés acceptant virgule et point.
const pctFormatter = v =>
  (v !== undefined && v !== null && v !== '') ? String(v).replace('.', ',') : '';
const pctParser = v => {
  if (!v) return undefined;
  const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
};
// Formatter monétaire : séparateur de milliers + virgule décimale (FR)
const montantFormatter = v =>
  v ? Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '';
const montantParser = v => {
  if (!v) return undefined;
  const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
};

// ── Sélecteur de devise (MRU par défaut — obligatoire avec le capital social) ──
const DEVISES = [
  { value: 'MRU', label_fr: 'MRU – Ouguiya mauritanien',  label_ar: 'أوقية موريتانية' },
  { value: 'USD', label_fr: 'USD – Dollar américain',     label_ar: 'دولار أمريكي' },
  { value: 'EUR', label_fr: 'EUR – Euro',                 label_ar: 'يورو' },
  { value: 'XOF', label_fr: 'XOF – Franc CFA (UEMOA)',   label_ar: 'فرنك أفريقي CFA' },
  { value: 'MAD', label_fr: 'MAD – Dirham marocain',     label_ar: 'درهم مغربي' },
  { value: 'DZD', label_fr: 'DZD – Dinar algérien',      label_ar: 'دينار جزائري' },
  { value: 'GBP', label_fr: 'GBP – Livre sterling',      label_ar: 'جنيه إسترليني' },
];

const DeviseSelect = (props) => {
  const { isAr } = useLanguage();
  return (
    <Select showSearch placeholder="MRU" {...props}>
      {DEVISES.map(d => (
        <Option key={d.value} value={d.value}>{isAr ? d.label_ar : d.label_fr}</Option>
      ))}
    </Select>
  );
};

// ─── Bannière inline de résultat doublon ─────────────────────────────────────
const DoublonBanner = ({ result, loading }) => {
  if (loading) return (
    <Alert type="info" showIcon message="Vérification en cours…" style={{ marginBottom: 12, padding: '6px 12px' }} />
  );
  if (!result?.type) return null;

  const isBlock = result.type === 'DOUBLON_CONFIRME';
  return (
    <Alert
      type={isBlock ? 'error' : 'warning'}
      showIcon
      style={{ marginBottom: 12 }}
      message={
        <span style={{ fontWeight: 600 }}>
          {isBlock ? '🚫 Doublon confirmé' : '⚠️ Doublon potentiel'}
        </span>
      }
      description={
        <div style={{ fontSize: 13 }}>
          {isBlock && result.motif && <p style={{ margin: '2px 0' }}>{result.motif}</p>}
          {(result.warnings || []).map((w, i) => (
            <p key={i} style={{ margin: '2px 0' }}>{w}</p>
          ))}
          {result.ra_existant && (
            <p style={{ margin: '4px 0' }}>
              Dossier existant : <strong>{result.ra_existant.numero_ra}</strong>
              {result.ra_existant.nom     && <> — {result.ra_existant.nom} {result.ra_existant.prenom}</>}
              {result.ra_existant.nni     && <> (NNI : {result.ra_existant.nni})</>}
              {result.ra_existant.numero_rc && <> — RC : {result.ra_existant.numero_rc}</>}
              {' '}<Tag color={isBlock ? 'red' : 'orange'} style={{ fontSize: 11 }}>
                {result.ra_existant.statut}
              </Tag>
            </p>
          )}
        </div>
      }
    />
  );
};

// ─── Hook partagé pour les données de paramétrage ────────────────────────────
const useParamData = () => {
  const { data: nationalites = [] } = useQuery({ queryKey: ['nationalites'], queryFn: () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []) });
  const { data: fonctions    = [] } = useQuery({ queryKey: ['fonctions'],    queryFn: () => parametrageAPI.fonctions().then(r => r.data?.results || r.data || []) });
  const { data: domaines     = [] } = useQuery({ queryKey: ['domaines'],     queryFn: () => parametrageAPI.domaines().then(r => r.data?.results || r.data || []) });
  const { data: formes       = [] } = useQuery({ queryKey: ['formes-juridiques'], queryFn: () => parametrageAPI.formesJuridiques().then(r => r.data?.results || r.data || []) });
  const { data: localites    = [] } = useQuery({ queryKey: ['localites'],    queryFn: () => parametrageAPI.localites().then(r => r.data?.results || r.data || []) });
  return { nationalites, fonctions, domaines, formes, localites };
};

// ─── Composant Table générique (Gérant / Associé / Directeur) ─────────────────
const TableEditable = ({ title, rows, setRows, columns, formFields, initialValues = {} }) => {
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(null);
  const [form]    = Form.useForm();
  const { t }     = useLanguage();

  const openAdd  = () => { setEditing(null); form.resetFields(); form.setFieldsValue(initialValues); setOpen(true); };
  const openEdit = (row) => { setEditing(row); form.setFieldsValue(row); setOpen(true); };
  const handleDelete = (key) => setRows(prev => prev.filter(r => r._key !== key));

  const handleOk = () => {
    form.validateFields().then(vals => {
      if (editing) {
        setRows(prev => prev.map(r => r._key === editing._key ? { ...r, ...vals } : r));
      } else {
        setRows(prev => [...prev, { ...vals, _key: Date.now() }]);
      }
      setOpen(false);
    });
  };

  const actionCol = {
    title: t('field.actions'), key: 'act', width: 90, fixed: 'right',
    render: (_, r) => (
      <Space>
        <Tooltip title={t('action.edit')}><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
        <Tooltip title={t('action.delete')}><Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r._key)} /></Tooltip>
      </Space>
    ),
  };

  return (
    <Card
      size="small"
      title={<Text strong>{title}</Text>}
      extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ background: '#1a4480' }}>{t('action.add')}</Button>}
      style={{ marginBottom: 16 }}
    >
      <Table
        dataSource={rows}
        columns={[...columns, actionCol]}
        rowKey="_key"
        size="small"
        pagination={false}
        locale={{ emptyText: t('common.no_data') }}
        scroll={{ x: 'max-content' }}
      />
      <Modal
        title={editing ? `${t('action.edit')} — ${title}` : `${t('action.add')} — ${title}`}
        open={open}
        onOk={handleOk}
        onCancel={() => setOpen(false)}
        width={700}
        okText={t('common.confirm')}
        cancelText={t('action.cancel')}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {formFields}
        </Form>
      </Modal>
    </Card>
  );
};

// ─── Formulaire Gérant — identification complète ─────────────────────────────
const GerantFormFields = ({ nationalites, fonctions }) => {
  const { t, field, isAr } = useLanguage();
  return (
    <Row gutter={16}>
      {/* ── Identité civile ─────────────────────────────────────────────── */}
      <Col span={8}>
        <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
          <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
        </Form.Item>
      </Col>
      <Col span={8}><Form.Item name="nom"    label={t('field.nom')}    rules={[{ required: true }, uppercaseRule(isAr)]}><Input /></Form.Item></Col>
      <Col span={8}><Form.Item name="prenom" label={t('field.prenom')}><Input /></Form.Item></Col>
      <Col span={8}>
        <Form.Item
          name="date_naissance"
          label={t('field.dateNaissance')}
          rules={[{
            validator(_, value) {
              if (!value) return Promise.resolve();
              const age = dayjs().diff(dayjs(value), 'year');
              if (age < 18)
                return Promise.reject(new Error('Un gérant doit être majeur (18 ans révolus). Un mineur ne peut pas être désigné gérant.'));
              return Promise.resolve();
            },
          }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={d => d && d.isAfter(dayjs())} />
        </Form.Item>
      </Col>
      <Col span={8}><Form.Item name="lieu_naissance" label={t('field.lieuNaissance')}><Input /></Form.Item></Col>
      <Col span={8}>
        <Form.Item name="nationalite_id" label={t('field.nationalite')}>
          <Select showSearch options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))} />
        </Form.Item>
      </Col>
      {/* ── Pièce d'identité ────────────────────────────────────────────── */}
      <Col span={8}>
        <Form.Item name="type_document" label="Type de pièce">
          <Select allowClear>
            <Option value="NNI">CNI / NNI</Option>
            <Option value="PASSEPORT">Passeport</Option>
            <Option value="AUTRE">Autre document</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="nni" label="N° NNI" rules={[nniRule(t)]}>
          <NniInput />
        </Form.Item>
      </Col>
      <Col span={8}><Form.Item name="num_passeport" label="N° Passeport"><Input /></Form.Item></Col>
      {/* ── Contact ─────────────────────────────────────────────────────── */}
      <Col span={8}><Form.Item name="telephone" label={t('field.telephone')}><Input /></Form.Item></Col>
      <Col span={16}><Form.Item name="domicile" label="Domicile / Adresse"><Input /></Form.Item></Col>
      {/* ── Fonction et mandat ──────────────────────────────────────────── */}
      <Col span={12}>
        <Form.Item name="fonction_id" label={t('field.fonction')}>
          <Select showSearch options={fonctions.map(f => ({ value: f.id, label: field(f, 'libelle') }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="date_debut" label={t('field.dateDebut')}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col span={24}><Form.Item name="pouvoirs" label="Pouvoirs"><TextArea rows={2} /></Form.Item></Col>
    </Row>
  );
};

// ─── Formulaire Associé — identification complète + calcul automatique ───────
const AssocieFormFields = ({ nationalites, capitalSocial }) => {
  const [typeAssoc, setTypeAssoc] = useState('PH');
  const { t, field, isAr } = useLanguage();
  const form = Form.useFormInstance();

  // capitalSocial connu et > 0 → valeur calculée automatiquement, champ désactivé
  const hasCapital = capitalSocial != null && parseFloat(capitalSocial) > 0;

  const handlePourcentageChange = (pct) => {
    if (hasCapital && pct != null) {
      const computed = Math.round(parseFloat(pct) * parseFloat(capitalSocial) / 100 * 100) / 100;
      form.setFieldValue('valeur_parts', computed);
    }
  };

  return (
    <Row gutter={16}>
      {/* ── Type d'associé ─────────────────────────────────────────────────── */}
      <Col span={24}>
        <Form.Item name="type_associe" label={t('entity.ph') + ' / ' + t('entity.pm')} initialValue="PH">
          <Select onChange={setTypeAssoc} options={[{ value: 'PH', label: t('entity.ph') }, { value: 'PM', label: t('entity.pm') }]} />
        </Form.Item>
      </Col>

      {/* ── Civilité (PH uniquement) ───────────────────────────────────────── */}
      {typeAssoc === 'PH' && (
        <Col span={8}>
          <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
            <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
          </Form.Item>
        </Col>
      )}
      {/* ── Nom / Dénomination ─────────────────────────────────────────────── */}
      <Col span={typeAssoc === 'PH' ? 8 : 24}>
        <Form.Item name="nom" label={typeAssoc === 'PH' ? t('field.nom') : t('field.denomination')} rules={[{ required: true }, uppercaseRule(isAr)]}>
          <Input />
        </Form.Item>
      </Col>
      {/* ── Prénom (PH uniquement) ──────────────────────────────────────────── */}
      {typeAssoc === 'PH' && (
        <Col span={8}>
          <Form.Item name="prenom" label={t('field.prenom')}>
            <Input />
          </Form.Item>
        </Col>
      )}
      <Col span={12}>
        <Form.Item name="nationalite_id" label={t('field.nationalite')}>
          <Select showSearch allowClear options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))} />
        </Form.Item>
      </Col>

      {/* ── Identification — Personne Physique ─────────────────────────────── */}
      {typeAssoc === 'PH' && (
        <>
          <Col span={8}>
            <Form.Item name="date_naissance" label={t('field.dateNaissance')}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={d => d && d.isAfter(dayjs())} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="lieu_naissance" label={t('field.lieuNaissance')}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="nni" label="N° NNI" rules={[nniRule(t)]}>
              <NniInput />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="num_passeport" label="N° Passeport">
              <Input />
            </Form.Item>
          </Col>
        </>
      )}

      {/* ── Identification — Personne Morale ───────────────────────────────── */}
      {typeAssoc === 'PM' && (
        <>
          <Col span={12}>
            <Form.Item name="numero_rc" label="N° RC / Identifiant">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="date_immatriculation" label="Date d'immatriculation">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
        </>
      )}

      {/* ── Parts sociales ─────────────────────────────────────────────────── */}
      <Col span={8}>
        <Form.Item name="nombre_parts" label={t('field.parts')}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item
          name="pourcentage"
          label="% Capital"
          rules={[{
            validator(_, v) {
              if (v == null || !hasCapital) return Promise.resolve();
              const expected = Math.round(parseFloat(v) * parseFloat(capitalSocial) / 100 * 100) / 100;
              const actual   = parseFloat(form.getFieldValue('valeur_parts') ?? 0);
              if (Math.abs(actual - expected) > 1)
                return Promise.reject(new Error(
                  `Incohérent : ${v} % × ${Number(capitalSocial).toLocaleString('fr-FR')} = ${expected.toLocaleString('fr-FR')} MRU`
                ));
              return Promise.resolve();
            },
          }]}
        >
          <InputNumber
            min={0} max={100} step={0.01} precision={2}
            style={{ width: '100%' }}
            onChange={handlePourcentageChange}
            formatter={pctFormatter}
            parser={pctParser}
          />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item
          name="valeur_parts"
          label={`Valeur (MRU)${hasCapital ? ' 🔒' : ''}`}
          tooltip={hasCapital ? 'Calculée automatiquement : % × capital social' : undefined}
        >
          <InputNumber
            min={0}
            style={{ width: '100%', background: hasCapital ? '#f5f5f5' : undefined }}
            disabled={hasCapital}
            formatter={montantFormatter}
            parser={montantParser}
          />
        </Form.Item>
      </Col>
    </Row>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  FORMULAIRE ADMINISTRATEUR SA — Conseil d'administration
// ─────────────────────────────────────────────────────────────────────────────
const AdministrateurFormFields = ({ nationalites }) => {
  const { t, field, isAr } = useLanguage();
  return (
    <Row gutter={16}>
      {/* ── Civilité ─────────────────────────────────────────────────────── */}
      <Col span={8}>
        <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
          <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
        </Form.Item>
      </Col>
      {/* ── Nom / Prénom : uniquement la langue active ────────────────────── */}
      {!isAr && <Col span={8}><Form.Item name="nom"       label={t('field.nom')}    rules={[{ required: true }, uppercaseRule(false)]}><Input /></Form.Item></Col>}
      {!isAr && <Col span={8}><Form.Item name="prenom"    label={t('field.prenom')}><Input /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="nom_ar"    label="الاسم"    rules={[{ required: true, message: 'الاسم مطلوب' }]}><Input dir="rtl" /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="prenom_ar" label="اللقب"><Input dir="rtl" /></Form.Item></Col>}
      {/* ── Autres champs communs ─────────────────────────────────────────── */}
      <Col span={12}>
        <Form.Item name="nationalite_id" label={t('field.nationalite')}>
          <Select showSearch allowClear options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="nni" label="NNI" rules={[nniRule(t)]}><NniInput /></Form.Item></Col>
      <Col span={12}><Form.Item name="num_passeport" label={isAr ? 'رقم الجواز' : 'N° Passeport'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_naissance" label={t('field.dateNaissance')}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col span={12}><Form.Item name="lieu_naissance" label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}><Input /></Form.Item></Col>
      <Col span={12}>
        <Form.Item name="fonction" label={isAr ? 'المهمة في مجلس الإدارة' : 'Fonction au CA'}
          tooltip={isAr ? 'مثال: رئيس، نائب الرئيس، مدير عام' : 'Ex. : Président, Vice-président, Administrateur délégué'}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="date_debut" label={isAr ? 'تاريخ تولي المهمة'  : 'Date de prise de fonction'}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_fin"   label={isAr ? 'تاريخ انتهاء المهمة' : 'Date de fin de mandat'}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col span={24}><Form.Item name="adresse"   label={t('field.adresse')}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="telephone" label={t('field.telephone')}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="email"     label={t('field.email')}><Input type="email" /></Form.Item></Col>
    </Row>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  FORMULAIRE COMMISSAIRE AUX COMPTES SA
// ─────────────────────────────────────────────────────────────────────────────
const CommissaireFormFields = ({ nationalites }) => {
  const { t, field, isAr } = useLanguage();
  const typeComm = Form.useWatch('type_commissaire');
  const isPH = !typeComm || typeComm === 'PH';
  return (
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="type_commissaire" label={isAr ? 'النوع' : 'Type'} initialValue="PH">
          <Select options={[
            { value: 'PH', label: isAr ? 'شخص طبيعي'  : 'Personne physique' },
            { value: 'PM', label: isAr ? 'شخص معنوي'  : 'Personne morale'   },
          ]} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="role" label={isAr ? 'الدور' : 'Rôle'} initialValue="TITULAIRE">
          <Select options={[
            { value: 'TITULAIRE', label: isAr ? 'أصيل'  : 'Titulaire'  },
            { value: 'SUPPLEANT', label: isAr ? 'نائب'  : 'Suppléant'  },
          ]} />
        </Form.Item>
      </Col>
      {/* ── Civilité (PH uniquement) ──────────────────────────────────────── */}
      {isPH && (
        <Col span={8}>
          <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
            <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
          </Form.Item>
        </Col>
      )}
      {/* ── Nom principal : uniquement la langue active ──────────────────── */}
      {!isAr && (
        <Col span={isPH ? 8 : 12}>
          <Form.Item name="nom" rules={[{ required: true }, uppercaseRule(false)]}
            label={isPH ? t('field.nom') : 'Dénomination sociale'}>
            <Input />
          </Form.Item>
        </Col>
      )}
      {isAr && (
        <Col span={isPH ? 8 : 12}>
          <Form.Item name="nom_ar" rules={[{ required: true, message: 'الاسم مطلوب' }]}
            label={isPH ? 'الاسم' : 'التسمية الاجتماعية'}>
            <Input dir="rtl" />
          </Form.Item>
        </Col>
      )}
      {/* ── Prénom : uniquement la langue active ──────────────────────────── */}
      {isPH && !isAr && <Col span={8}><Form.Item name="prenom"    label={t('field.prenom')}><Input /></Form.Item></Col>}
      {isPH &&  isAr && <Col span={8}><Form.Item name="prenom_ar" label="اللقب"><Input dir="rtl" /></Form.Item></Col>}
      {isPH && <Col span={12}><Form.Item name="nni" label="NNI" rules={[nniRule(t)]}><NniInput /></Form.Item></Col>}
      {isPH && <Col span={12}><Form.Item name="num_passeport" label={isAr ? 'رقم الجواز' : 'N° Passeport'}><Input /></Form.Item></Col>}
      {isPH && <Col span={12}><Form.Item name="date_naissance" label={t('field.dateNaissance')}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>}
      {isPH && <Col span={12}><Form.Item name="lieu_naissance" label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}><Input /></Form.Item></Col>}
      <Col span={12}>
        <Form.Item name="nationalite_id" label={t('field.nationalite')}>
          <Select showSearch allowClear options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="date_debut" label={isAr ? 'تاريخ التعيين'       : 'Date de nomination'}>  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_fin"   label={isAr ? 'تاريخ انتهاء المهمة' : 'Date de fin de mandat'}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col span={24}><Form.Item name="adresse"   label={t('field.adresse')}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="telephone" label={t('field.telephone')}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="email"     label={t('field.email')}><Input type="email" /></Form.Item></Col>
    </Row>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  BLOC DÉCLARANT — commun à tous les types d'entité
// ─────────────────────────────────────────────────────────────────────────────
const SectionDeclarant = ({ nationalites }) => {
  const { field, t, isAr } = useLanguage();
  const form = Form.useFormInstance();

  // Suggestions chargées depuis l'API
  const [nomOptions,    setNomOptions]    = useState([]);
  const [nniOptions,    setNniOptions]    = useState([]);
  const [searchingNom,  setSearchingNom]  = useState(false);
  const [searchingNni,  setSearchingNni]  = useState(false);

  const nomTimerRef = useRef(null);
  const nniTimerRef = useRef(null);

  // Recherche par nom — debounce 300 ms
  const handleNomSearch = (val) => {
    if (nomTimerRef.current) clearTimeout(nomTimerRef.current);
    if (!val || val.length < 2) { setNomOptions([]); return; }
    nomTimerRef.current = setTimeout(async () => {
      try {
        setSearchingNom(true);
        const res = await registreAPI.declarantSearch(val, 'nom');
        setNomOptions(res.data.map(d => ({
          value: [d.nom, d.prenom].filter(Boolean).join(' '),
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>{d.nom}</strong> {d.prenom}</span>
              {d.nni && <span style={{ color: '#888', fontSize: 12 }}>NNI : {d.nni}</span>}
            </div>
          ),
          _declarant: d,
        })));
      } catch (_) { /* silencieux */ }
      finally { setSearchingNom(false); }
    }, 300);
  };

  // Recherche par NNI — debounce 300 ms
  const handleNniSearch = (val) => {
    // Filtrer les non-chiffres en temps réel
    const digits = String(val || '').replace(/\D/g, '').slice(0, 10);
    if (digits !== val) {
      form.setFieldValue('declarant_nni', digits);
      val = digits;
    }
    if (nniTimerRef.current) clearTimeout(nniTimerRef.current);
    if (!val || val.length < 2) { setNniOptions([]); return; }
    nniTimerRef.current = setTimeout(async () => {
      try {
        setSearchingNni(true);
        const res = await registreAPI.declarantSearch(val, 'nni');
        setNniOptions(res.data.map(d => ({
          value: d.nni,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>NNI : <strong>{d.nni}</strong></span>
              <span style={{ color: '#555' }}>{d.nom} {d.prenom}</span>
            </div>
          ),
          _declarant: d,
        })));
      } catch (_) { /* silencieux */ }
      finally { setSearchingNni(false); }
    }, 300);
  };

  // Remplissage automatique quand un déclarant existant est sélectionné
  const fillDeclarant = (opt) => {
    const d = opt?._declarant;
    if (!d) return;
    form.setFieldsValue({
      declarant_nom:           d.nom            || '',
      declarant_prenom:        d.prenom         || '',
      declarant_nni:           d.nni            || '',
      declarant_num_passeport: d.num_passeport  || '',
      declarant_date_naissance: d.date_naissance ? dayjs(d.date_naissance) : null,
      declarant_lieu_naissance: d.lieu_naissance || '',
      declarant_nationalite_id: d.nationalite_id || undefined,
    });
  };

  return (
    <Card
      title={
        <Space>
          <UserOutlined />
          <span style={{ fontWeight: 600 }}>
            {isAr ? t('declarant.sectionTitle') : "Déclarant — Identité de la personne déposant l'acte"}
          </span>
        </Space>
      }
      style={{ marginBottom: 16, borderColor: '#1a4480', background: '#f0f5ff' }}
      headStyle={{ background: '#e6f0ff', borderBottom: '1px solid #b3caff' }}
    >
      <Alert
        type="info"
        showIcon
        message={isAr ? t('declarant.alertInfo') : 'Saisissez le nom ou le NNI pour retrouver un déclarant existant ou en créer un nouveau.'}
        style={{ marginBottom: 12, padding: '6px 12px' }}
      />
      <Row gutter={16}>
        {/* Nom — AutoComplete */}
        <Col span={8}>
          <Form.Item
            name="declarant_nom"
            label={isAr ? t('declarant.nom') : 'Nom'}
            rules={[{ required: true, message: isAr ? t('declarant.required') : 'Le nom du déclarant est requis.' }]}
          >
            <AutoComplete
              options={nomOptions}
              onSearch={handleNomSearch}
              onSelect={(val, opt) => fillDeclarant(opt)}
              notFoundContent={searchingNom ? <Spin size="small" /> : null}
              placeholder={isAr ? t('declarant.ph.nom') : 'Nom du déclarant…'}
              allowClear
            />
          </Form.Item>
        </Col>

        {/* Prénom */}
        <Col span={8}>
          <Form.Item name="declarant_prenom" label={isAr ? t('declarant.prenom') : 'Prénom(s)'}>
            <Input placeholder={isAr ? t('declarant.ph.prenom') : 'Prénom(s)'} />
          </Form.Item>
        </Col>

        {/* NNI — AutoComplete */}
        <Col span={8}>
          <Form.Item name="declarant_nni" label={isAr ? t('declarant.nni') : 'NNI'} rules={[nniRule(t)]}>
            <AutoComplete
              options={nniOptions}
              onSearch={handleNniSearch}
              onSelect={(val, opt) => fillDeclarant(opt)}
              notFoundContent={searchingNni ? <Spin size="small" /> : null}
              placeholder={isAr ? t('declarant.ph.nni') : "Numéro national d'identité…"}
              allowClear
            />
          </Form.Item>
        </Col>

        {/* N° Passeport */}
        <Col span={8}>
          <Form.Item name="declarant_num_passeport" label={isAr ? t('declarant.passeport') : 'N° Passeport'}>
            <Input placeholder={isAr ? t('declarant.ph.passeport') : 'Numéro de passeport (si NNI non disponible)'} />
          </Form.Item>
        </Col>

        {/* Date de naissance */}
        <Col span={8}>
          <Form.Item name="declarant_date_naissance" label={isAr ? t('declarant.dateNaissance') : 'Date de naissance'}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY"
              placeholder={isAr ? 'يي/شش/سسسس' : 'JJ/MM/AAAA'} />
          </Form.Item>
        </Col>

        {/* Lieu de naissance */}
        <Col span={8}>
          <Form.Item name="declarant_lieu_naissance" label={isAr ? t('declarant.lieuNaissance') : 'Lieu de naissance'}>
            <Input placeholder={isAr ? t('declarant.ph.lieu') : 'Ville / commune…'} />
          </Form.Item>
        </Col>

        {/* Nationalité */}
        <Col span={12}>
          <Form.Item name="declarant_nationalite_id" label={isAr ? t('declarant.nationalite') : 'Nationalité'}>
            <Select
              showSearch
              allowClear
              placeholder={isAr ? t('declarant.ph.nationalite') : 'Sélectionner une nationalité'}
              options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))}
            />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION PERSONNE PHYSIQUE
// ─────────────────────────────────────────────────────────────────────────────
const SectionPH = ({ nationalites, fonctions, domaines, gerants, setGerants,
                     onCheckDoublon, doublonResult, doublonLoading,
                     isMineur, onMineurChange,
                     gerantLuiMeme, setGerantLuiMeme }) => {
  const { t, field, isAr } = useLanguage();
  const formInst = Form.useFormInstance();

  const gerantCols = [
    { title: t('field.nom'),         key: 'identite',     render: (_, r) => [formatCivilite(r.civilite, isAr ? 'ar' : 'fr'), r.prenom, r.nom].filter(Boolean).join(' ') },
    { title: 'Date naiss.',          dataIndex: 'date_naissance', render: v => v ? (typeof v === 'string' ? v : v.format?.('DD/MM/YYYY')) : '—' },
    { title: 'Pièce d\'identité',    key: 'piece',        render: (_, r) => r.nni ? `NNI : ${r.nni}` : r.num_passeport ? `Passport : ${r.num_passeport}` : '—' },
    { title: t('field.nationalite'), dataIndex: 'nationalite_id', render: id => { const n = nationalites.find(x => x.id === id); return n ? field(n, 'libelle') : '—'; } },
    { title: t('field.fonction'),    dataIndex: 'fonction_id',    render: id => { const f = fonctions.find(x => x.id === id); return f ? field(f, 'libelle') : '—'; } },
  ];

  return (
    <>
      <Card title={`👤 ${t('form.identity')}`} style={{ marginBottom: 16 }}>
        {/* Bannière de résultat doublon — affichée en temps réel */}
        <DoublonBanner result={doublonResult} loading={doublonLoading} />
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              name="civilite"
              label={t('field.civilite')}
              rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}
            >
              <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="nom" label={t('field.nom')} rules={[{ required: true }, uppercaseRule(isAr)]}>
              <Input onBlur={() => {
                const nom    = formInst.getFieldValue('nom')?.trim();
                const prenom = formInst.getFieldValue('prenom')?.trim();
                if (nom && prenom && onCheckDoublon)
                  onCheckDoublon({ type_entite: 'PH', nom, prenom,
                    date_naissance: formInst.getFieldValue('date_naissance')?.format?.('YYYY-MM-DD') || undefined,
                    lieu_naissance: formInst.getFieldValue('lieu_naissance') || undefined });
              }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="prenom" label={t('field.prenom')}>
              <Input onBlur={() => {
                const nom    = formInst.getFieldValue('nom')?.trim();
                const prenom = formInst.getFieldValue('prenom')?.trim();
                if (nom && prenom && onCheckDoublon)
                  onCheckDoublon({ type_entite: 'PH', nom, prenom,
                    date_naissance: formInst.getFieldValue('date_naissance')?.format?.('YYYY-MM-DD') || undefined,
                    lieu_naissance: formInst.getFieldValue('lieu_naissance') || undefined });
              }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="nationalite_id" label={t('field.nationalite')}>
              <Select showSearch options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="date_naissance"
              label={t('field.dateNaissance')}
              rules={[{
                validator(_, value) {
                  if (!value) return Promise.resolve();
                  const age = dayjs().diff(dayjs(value), 'year');
                  if (age < 18)
                    return Promise.reject(new Error('La personne physique est mineure (moins de 18 ans). L\'immatriculation est impossible.'));
                  return Promise.resolve();
                },
              }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                disabledDate={d => d && d.isAfter(dayjs())}
                onChange={(val) => {
                  if (!val) { onMineurChange?.(false); return; }
                  onMineurChange?.(dayjs().diff(dayjs(val), 'year') < 18);
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}><Form.Item name="lieu_naissance" label={t('field.lieuNaissance')}><Input /></Form.Item></Col>
          <Col span={8}>
            <Form.Item name="regime_matrimonial" label={t('field.situationMatrimoniale')}>
              <Select allowClear>
                <Option value="CELIBATAIRE">{t('sm.celibataire')}</Option>
                <Option value="MARIE">{t('sm.marie')}</Option>
                <Option value="DIVORCE">{t('sm.divorce')}</Option>
                <Option value="VEUF">{t('sm.veuf')}</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="nni"
              label={t('field.nni')}
              rules={[nniRule(t)]}
            >
              <NniInput
                onBlur={(e) => {
                  const nni = e.target.value.trim();
                  if (nni && onCheckDoublon) onCheckDoublon({ type_entite: 'PH', nni });
                  else if (!nni && onCheckDoublon) onCheckDoublon(null);
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}><Form.Item name="num_passeport" label={t('field.passeport')}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="contact"       label={t('field.telephone')}><Input /></Form.Item></Col>
          <Col span={24}><Form.Item name="adresse_siege" label={t('field.adresse')} rules={[{ required: true }]}><Input /></Form.Item></Col>
        </Row>
      </Card>

      <Card title={`🏭 ${t('form.activity')}`} style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}><Form.Item name="denomination" label={t('field.denomination')} rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="domaines" label={t('tab.domaines')}>
              <Select mode="multiple" options={domaines.map(d => ({ value: d.id, label: field(d, 'libelle') }))} />
            </Form.Item>
          </Col>
          <Col span={12}><Form.Item name="activite"       label={t('field.activite')} rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="origine_fonds" label={t('field.origineFonds')}>
              <Select allowClear>
                <Option value="Personnel">Fonds personnel</Option>
                <Option value="Heritage">Héritage</Option>
                <Option value="Achat">Achat</Option>
                <Option value="Location-gerance">Location-gérance</Option>
                <Option value="Autre">Autre</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* Alerte mineur — bloquante, affichée dès que la date est saisie */}
      {isMineur && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="⛔ Immatriculation impossible — personne mineure"
          description="Une personne physique âgée de moins de 18 ans ne peut pas être immatriculée en tant que commerçant au RCCM. Elle peut cependant être enregistrée comme associée ou actionnaire."
        />
      )}

      <Card
        title={`👔 ${t('form.gerant')}`}
        style={{ marginBottom: 16, opacity: isMineur ? 0.5 : 1 }}
      >
        {isMineur ? (
          <Alert
            type="warning"
            showIcon
            message="La désignation d'un gérant est désactivée : la personne principale est mineure."
          />
        ) : (
          <>
            <Form.Item>
              <Checkbox checked={gerantLuiMeme} onChange={e => { setGerantLuiMeme(e.target.checked); if (e.target.checked) setGerants([]); }}>
                {t('form.gerant_lui_meme')}
              </Checkbox>
            </Form.Item>
            {!gerantLuiMeme && (
              <TableEditable
                title={t('form.gerant')}
                rows={gerants}
                setRows={setGerants}
                columns={gerantCols}
                formFields={<GerantFormFields nationalites={nationalites} fonctions={fonctions} />}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION PERSONNE MORALE
// ─────────────────────────────────────────────────────────────────────────────
// ── Helper : calcule le total % des associés ──────────────────────────────────
const totalPourcentage = (associes) =>
  associes.reduce((sum, a) => sum + (parseFloat(a.pourcentage) || 0), 0);

const SectionPM = ({ nationalites, fonctions, domaines, formes, gerants, setGerants, associes, setAssocies,
                      administrateurs, setAdministrateurs, commissaires, setCommissaires,
                      onCheckDoublon, doublonResult, doublonLoading }) => {
  const { t, field, isAr } = useLanguage();
  // Écoute réactive du capital social (champ du formulaire principal)
  const capitalSocial = Form.useWatch('capital_social');
  const csNum = parseFloat(capitalSocial) || 0;
  // Détection SA — réactive sur le champ forme_juridique_id
  const formeJuridiqueId = Form.useWatch('forme_juridique_id');
  const estSA = formes.find(f => f.id === formeJuridiqueId)?.code === 'SA';

  // ── Auto-recalcul des valeur_parts quand le capital social change ────────────
  // Formule : valeur_parts = pourcentage × capital / 100
  // Déclenché uniquement si le capital est valide et des associés sont présents.
  useEffect(() => {
    if (csNum <= 0 || associes.length === 0) return;
    let changed = false;
    const updated = associes.map(a => {
      const pct = parseFloat(a.pourcentage);
      if (!pct) return a;
      const newValeur = Math.round(pct * csNum / 100 * 100) / 100;
      if (parseFloat(a.valeur_parts) !== newValeur) changed = true;
      return { ...a, valeur_parts: newValeur };
    });
    if (changed) setAssocies(updated);
  }, [csNum]); // eslint-disable-line

  const gerantCols = [
    { title: t('field.nom'),         key: 'identite',      render: (_, r) => [r.nom, r.prenom].filter(Boolean).join(' ') },
    { title: 'Date naiss.',          dataIndex: 'date_naissance', render: v => v ? (typeof v === 'string' ? v : v.format?.('DD/MM/YYYY')) : '—' },
    { title: 'Pièce d\'identité',    key: 'piece',         render: (_, r) => r.nni ? `NNI : ${r.nni}` : r.num_passeport ? `Passeport : ${r.num_passeport}` : '—' },
    { title: t('field.nationalite'), dataIndex: 'nationalite_id', render: id => { const n = nationalites.find(x => x.id === id); return n ? field(n, 'libelle') : '—'; } },
    { title: t('field.fonction'),    dataIndex: 'fonction_id',    render: id => { const f = fonctions.find(x => x.id === id); return f ? field(f, 'libelle') : '—'; } },
  ];
  const associeCols = [
    { title: t('field.type'),        dataIndex: 'type_associe', width: 55, render: v => <Tag color={v === 'PH' ? 'blue' : 'green'}>{v}</Tag> },
    { title: t('field.nom'),         key: 'identite', render: (_, r) => [r.nom, r.prenom].filter(Boolean).join(' ') || '—' },
    { title: 'Identification',       key: 'ident', render: (_, r) => r.type_associe === 'PH'
        ? (r.nni ? `NNI : ${r.nni}` : r.num_passeport ? `Passeport : ${r.num_passeport}` : '—')
        : (r.numero_rc || '—') },
    { title: t('field.parts'),       dataIndex: 'nombre_parts' },
    { title: t('field.pourcentage'), dataIndex: 'pourcentage', render: v => v ? `${v}%` : '-' },
  ];
  // ── Colonnes Administrateurs SA ──────────────────────────────────────────
  const adminCols = [
    { title: t('field.nom'), key: 'identite', render: (_, r) => [r.nom, r.prenom].filter(Boolean).join(' ') },
    { title: isAr ? 'المهمة' : 'Fonction', dataIndex: 'fonction', render: v => v || '—' },
    { title: t('field.nationalite'), dataIndex: 'nationalite_id',
      render: id => { const n = nationalites.find(x => x.id === id); return n ? field(n, 'libelle') : '—'; } },
    { title: isAr ? 'بداية المهمة' : 'Prise de fonction', dataIndex: 'date_debut',
      render: v => v ? (typeof v === 'string' ? v : v.format?.('DD/MM/YYYY')) : '—' },
    { title: isAr ? 'نهاية المهمة' : 'Fin de mandat', dataIndex: 'date_fin',
      render: v => v ? (typeof v === 'string' ? v : v.format?.('DD/MM/YYYY')) : '—' },
  ];
  // ── Colonnes Commissaires aux comptes SA ─────────────────────────────────
  const commissaireCols = [
    { title: t('field.nom'), key: 'identite', render: (_, r) => [r.nom, r.prenom].filter(Boolean).join(' ') },
    { title: isAr ? 'الدور' : 'Rôle', dataIndex: 'role',
      render: v => <Tag color={v === 'TITULAIRE' ? 'blue' : 'orange'}>
        {v === 'TITULAIRE' ? (isAr ? 'أصيل' : 'Titulaire') : (isAr ? 'نائب' : 'Suppléant')}
      </Tag> },
    { title: isAr ? 'النوع' : 'Type', dataIndex: 'type_commissaire',
      render: v => <Tag>{v || 'PH'}</Tag> },
    { title: t('field.nationalite'), dataIndex: 'nationalite_id',
      render: id => { const n = nationalites.find(x => x.id === id); return n ? field(n, 'libelle') : '—'; } },
    { title: isAr ? 'تاريخ التعيين' : 'Nomination', dataIndex: 'date_debut',
      render: v => v ? (typeof v === 'string' ? v : v.format?.('DD/MM/YYYY')) : '—' },
  ];

  // ── Indicateurs temps réel : % et valeur totale ──────────────────────────
  const total      = totalPourcentage(associes);
  const totalFmt   = parseFloat(total.toFixed(2));
  const pctOk      = Math.abs(total - 100) < 0.01;
  const pctOver    = total > 100;
  const restant    = parseFloat((100 - total).toFixed(2));

  const totalValeur = associes.reduce((s, a) => s + (parseFloat(a.valeur_parts) || 0), 0);
  const valeurOk    = csNum > 0 ? Math.abs(totalValeur - csNum) <= 1 : true;

  const progressStatus = pctOk ? 'success' : pctOver ? 'exception' : 'active';
  const progressColor  = pctOk ? '#52c41a' : pctOver ? '#ff4d4f' : '#faad14';

  return (
    <>
      <Card title={`🏢 ${t('form.section_constitution')}`} style={{ marginBottom: 16 }}>
        {/* Bannière de résultat doublon — affichée en temps réel */}
        <DoublonBanner result={doublonResult} loading={doublonLoading} />
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="denomination" label={t('field.denominationFr')} rules={[{ required: true }]}>
              <Input onBlur={(e) => {
                const denom = e.target.value.trim();
                if (denom && onCheckDoublon) onCheckDoublon({ type_entite: 'PM', denomination: denom });
                else if (!denom && onCheckDoublon) onCheckDoublon(null);
              }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="forme_juridique_id" label={t('field.formeJuridique')} rules={[{ required: true }]}>
              <Select showSearch options={formes.map(f => ({ value: f.id, label: isAr ? field(f, 'libelle') : `${f.code} – ${f.libelle_fr}` }))} />
            </Form.Item>
          </Col>
          <Col span={8}><Form.Item name="date_depot_statuts" label="Date dépôt statuts" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          {/* Capital social + devise — la devise est obligatoire (CDC) */}
          <Col span={10}>
            <Form.Item label={t('field.capitalSocial')} style={{ marginBottom: 0 }}>
              <Input.Group compact>
                <Form.Item name="capital_social" noStyle>
                  <InputNumber min={0} style={{ width: '65%' }} placeholder="0" />
                </Form.Item>
                <Form.Item name="devise_capital" noStyle initialValue="MRU">
                  <DeviseSelect style={{ width: '35%' }} />
                </Form.Item>
              </Input.Group>
            </Form.Item>
          </Col>
          <Col span={6}><Form.Item name="duree_societe"      label={t('field.duree')}><InputNumber min={1} max={99} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item name="contact"            label={t('field.telephone')}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="email"              label={t('field.email')}><Input type="email" /></Form.Item></Col>
          <Col span={8}>
            <Form.Item name="domaines" label={t('tab.domaines')}>
              <Select mode="multiple" options={domaines.map(d => ({ value: d.id, label: field(d, 'libelle') }))} />
            </Form.Item>
          </Col>
          <Col span={24}><Form.Item name="adresse_siege" label={t('field.siegeSocial')} rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={24}><Form.Item name="objet_social"  label={t('field.objetSocial')}><TextArea rows={2} /></Form.Item></Col>
        </Row>
      </Card>

      <TableEditable
        title={`👔 ${t('form.gerants')}`}
        rows={gerants}
        setRows={setGerants}
        columns={gerantCols}
        formFields={<GerantFormFields nationalites={nationalites} fonctions={fonctions} />}
      />

      <TableEditable
        title={`🤝 ${t('form.associes')}`}
        rows={associes}
        setRows={setAssocies}
        columns={associeCols}
        formFields={<AssocieFormFields nationalites={nationalites} capitalSocial={capitalSocial} />}
        initialValues={{ type_associe: 'PH' }}
      />

      {/* ── Indicateur % capital en temps réel ─────────────────────────────── */}
      {associes.length > 0 && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            borderColor: pctOk ? '#b7eb8f' : pctOver ? '#ffa39e' : '#ffe58f',
            background:  pctOk ? '#f6ffed' : pctOver ? '#fff2f0' : '#fffbe6',
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong style={{ color: progressColor }}>
                📊 Répartition du capital — Total : <strong>{totalFmt} %</strong>
              </Text>
              {!pctOk && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {pctOver
                    ? `Dépassement : +${parseFloat((total - 100).toFixed(2))} %`
                    : `Restant à affecter : ${restant} %`}
                </Text>
              )}
            </Space>
            <Progress
              percent={Math.min(totalFmt, 100)}
              status={progressStatus}
              strokeColor={progressColor}
              format={() => `${totalFmt} %`}
            />
            {!pctOk && (
              <Alert
                type={pctOver ? 'error' : 'warning'}
                showIcon
                message="Le total des parts sociales doit être égal à 100 %"
                description={
                  pctOver
                    ? `Total actuel : ${totalFmt} % — Veuillez réduire les pourcentages de ${parseFloat((total - 100).toFixed(2))} %.`
                    : `Total actuel : ${totalFmt} % — Il manque ${restant} % à répartir entre les associés.`
                }
                style={{ padding: '8px 12px' }}
              />
            )}
            {pctOk && (
              <Alert
                type="success"
                showIcon
                message="Répartition du capital validée — Total : 100 %"
                style={{ padding: '6px 12px' }}
              />
            )}
            {/* ── Indicateur valeur totale vs capital social ─────────────── */}
            {csNum > 0 && (
              <Alert
                type={valeurOk ? 'success' : 'warning'}
                showIcon
                message={
                  valeurOk
                    ? `Valeur totale des parts : ${totalValeur.toLocaleString('fr-FR')} MRU = capital social ✓`
                    : `Recalcul en cours… Valeur totale : ${totalValeur.toLocaleString('fr-FR')} MRU — Capital : ${csNum.toLocaleString('fr-FR')} MRU`
                }
                style={{ padding: '6px 12px' }}
              />
            )}
          </Space>
        </Card>
      )}

      {/* ── SA : Conseil d'administration ──────────────────────────────────── */}
      {estSA && (
        <TableEditable
          title={`🏛️ ${isAr ? 'أعضاء مجلس الإدارة' : "Conseil d'administration (Administrateurs)"}`}
          rows={administrateurs}
          setRows={setAdministrateurs}
          columns={adminCols}
          formFields={<AdministrateurFormFields nationalites={nationalites} />}
        />
      )}

      {/* ── SA : Commissaires aux comptes ──────────────────────────────────── */}
      {estSA && (
        <TableEditable
          title={`🔍 ${isAr ? 'مراقبو الحسابات' : 'Commissaires aux comptes'}`}
          rows={commissaires}
          setRows={setCommissaires}
          columns={commissaireCols}
          formFields={<CommissaireFormFields nationalites={nationalites} />}
          initialValues={{ type_commissaire: 'PH', role: 'TITULAIRE' }}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION SUCCURSALE
// ─────────────────────────────────────────────────────────────────────────────
const SectionSC = ({ nationalites, fonctions, domaines, formes, directeurs, setDirecteurs,
                      onCheckDoublon, doublonResult, doublonLoading }) => {
  const { t, field, isAr } = useLanguage();

  const directeurCols = [
    { title: t('field.nom'),         key: 'identite',      render: (_, r) => [r.nom, r.prenom].filter(Boolean).join(' ') },
    { title: 'Date naiss.',          dataIndex: 'date_naissance', render: v => v ? (typeof v === 'string' ? v : v.format?.('DD/MM/YYYY')) : '—' },
    { title: 'Pièce d\'identité',    key: 'piece',         render: (_, r) => r.nni ? `NNI : ${r.nni}` : r.num_passeport ? `Passeport : ${r.num_passeport}` : '—' },
    { title: t('field.nationalite'), dataIndex: 'nationalite_id', render: id => { const n = nationalites.find(x => x.id === id); return n ? field(n, 'libelle') : '—'; } },
    { title: t('field.fonction'),    dataIndex: 'fonction_id',    render: id => { const f = fonctions.find(x => x.id === id); return f ? field(f, 'libelle') : '—'; } },
  ];

  return (
    <>
      <Card title={`🌐 ${t('entity.sc')}`} style={{ marginBottom: 16 }}>
        {/* Bannière de résultat doublon — affichée en temps réel */}
        <DoublonBanner result={doublonResult} loading={doublonLoading} />
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="denomination" label={t('field.denomination')} rules={[{ required: true }]}>
              <Input onBlur={(e) => {
                const denom = e.target.value.trim();
                if (denom && onCheckDoublon) onCheckDoublon({ type_entite: 'SC', denomination: denom });
                else if (!denom && onCheckDoublon) onCheckDoublon(null);
              }} />
            </Form.Item>
          </Col>
          <Col span={12}><Form.Item name="contact"       label={t('field.telephone')}><Input /></Form.Item></Col>
          <Col span={24}><Form.Item name="adresse_siege" label={t('field.siegeSocial')} rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="domaines" label={t('tab.domaines')}>
              <Select mode="multiple" options={domaines.map(d => ({ value: d.id, label: field(d, 'libelle') }))} />
            </Form.Item>
          </Col>
          <Col span={12}><Form.Item name="email" label={t('field.email')}><Input type="email" /></Form.Item></Col>
          <Col span={24}><Form.Item name="objet_social" label={t('field.objetSocial')}><TextArea rows={2} /></Form.Item></Col>
        </Row>
      </Card>

      <TableEditable
        title={`🧑‍💼 ${t('form.directeurs')}`}
        rows={directeurs}
        setRows={setDirecteurs}
        columns={directeurCols}
        formFields={<GerantFormFields nationalites={nationalites} fonctions={fonctions} />}
      />

      <Card title={`🏦 ${t('form.section_maison_mere')}`} style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}><Form.Item name={['maison_mere', 'denomination_sociale']} label={t('field.denominationFr')} rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name={['maison_mere', 'forme_juridique_id']} label={t('field.formeJuridique')}>
              <Select showSearch options={formes.map(f => ({ value: f.id, label: isAr ? field(f, 'libelle') : `${f.code} – ${f.libelle_fr}` }))} />
            </Form.Item>
          </Col>
          <Col span={8}><Form.Item name={['maison_mere', 'date_depot_statuts']}   label="Date dépôt statuts"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          <Col span={8}><Form.Item name={['maison_mere', 'date_immatriculation']} label={t('field.dateImmat')}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          <Col span={8}><Form.Item name={['maison_mere', 'numero_rc']}            label={t('field.numeroRC')}><Input /></Form.Item></Col>
          <Col span={8}>
            <Form.Item name={['maison_mere', 'nationalite_id']} label={t('field.nationalite')}>
              <Select showSearch options={nationalites.map(n => ({ value: n.id, label: field(n, 'libelle') }))} />
            </Form.Item>
          </Col>
          {/* Capital social maison mère + devise — la devise est obligatoire (CDC) */}
          <Col span={10}>
            <Form.Item label={t('field.capitalSocial')} style={{ marginBottom: 0 }}>
              <Input.Group compact>
                <Form.Item name={['maison_mere', 'capital_social']} noStyle>
                  <InputNumber min={0} style={{ width: '65%' }} placeholder="0" />
                </Form.Item>
                <Form.Item name={['maison_mere', 'devise_capital']} noStyle initialValue="MRU">
                  <DeviseSelect style={{ width: '35%' }} />
                </Form.Item>
              </Input.Group>
            </Form.Item>
          </Col>
          <Col span={6}><Form.Item name={['maison_mere', 'siege_social']}   label={t('field.siegeSocial')}><Input /></Form.Item></Col>
        </Row>
      </Card>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────
// ─── Helper : convertit les données API → valeurs initiales du formulaire ────
const _apiToFormValues = (rcData, raData) => {
  const desc  = rcData.description_parsed || {};
  const te    = raData.type_entite;
  const ph    = raData.ph_data;
  const pm    = raData.pm_data;
  const sc    = raData.sc_data;

  // ── Déclarant structuré (nouveau) ou chaîne legacy (ancien) ──────────────
  const dd = rcData.declarant_data;
  const declarantVals = dd
    ? {
        declarant_nom:            dd.nom            || '',
        declarant_prenom:         dd.prenom         || '',
        declarant_nni:            dd.nni            || '',
        declarant_num_passeport:  dd.num_passeport  || '',
        declarant_date_naissance: dd.date_naissance ? dayjs(dd.date_naissance) : null,
        declarant_lieu_naissance: dd.lieu_naissance || '',
        declarant_nationalite_id: dd.nationalite_id || undefined,
      }
    : {};  // Si pas de déclarant structuré, on laisse les champs vides

  const vals = {
    date_acte:    rcData.date_acte  ? dayjs(rcData.date_acte)  : null,
    localite_id:  raData.localite   || undefined,
    observations: rcData.observations || '',
    choix_be:     desc.choix_be     || undefined,
    ...declarantVals,
  };

  if (te === 'PH' && ph) {
    Object.assign(vals, {
      nom:               ph.nom               || '',
      prenom:            ph.prenom            || '',
      nni:               ph.nni               || '',
      num_passeport:     ph.num_passeport     || '',
      date_naissance:    ph.date_naissance    ? dayjs(ph.date_naissance)    : null,
      lieu_naissance:    ph.lieu_naissance    || '',
      regime_matrimonial: ph.situation_matrimoniale || undefined,
      nationalite_id:    ph.nationalite       || undefined,
      adresse_siege:     ph.adresse           || '',
      contact:           ph.telephone         || '',
      denomination:      desc.denomination_commerciale || '',
      activite:          desc.activite        || '',
      origine_fonds:     desc.origine_fonds   || undefined,
      domaines:          (raData.domaines || []).map(d => d.domaine),
    });
  } else if (te === 'PM' && pm) {
    Object.assign(vals, {
      denomination:       pm.denomination     || '',
      forme_juridique_id: pm.forme_juridique  || undefined,
      date_depot_statuts: pm.date_constitution ? dayjs(pm.date_constitution) : null,
      capital_social:     pm.capital_social   ? parseFloat(pm.capital_social) : undefined,
      devise_capital:     pm.devise_capital   || 'MRU',
      duree_societe:      pm.duree_societe    || undefined,
      contact:            pm.telephone        || '',
      email:              pm.email            || '',
      adresse_siege:      pm.siege_social     || '',
      objet_social:       desc.objet_social   || '',
      domaines:           (raData.domaines || []).map(d => d.domaine),
    });
  } else if (te === 'SC' && sc) {
    const mm = desc.maison_mere || {};
    Object.assign(vals, {
      denomination:       sc.denomination     || '',
      contact:            sc.telephone        || '',
      email:              sc.email            || '',
      adresse_siege:      sc.siege_social     || '',
      objet_social:       desc.objet_social   || '',
      domaines:           (raData.domaines || []).map(d => d.domaine),
      maison_mere: {
        denomination_sociale:  mm.denomination_sociale  || '',
        forme_juridique_id:    mm.forme_juridique_id    || undefined,
        date_depot_statuts:    mm.date_depot_statuts    ? dayjs(mm.date_depot_statuts)    : null,
        date_immatriculation:  mm.date_immatriculation  ? dayjs(mm.date_immatriculation)  : null,
        numero_rc:             mm.numero_rc             || '',
        nationalite_id:        mm.nationalite_id        || undefined,
        capital_social:        mm.capital_social        ? parseFloat(mm.capital_social) : undefined,
        devise_capital:        mm.devise_capital        || 'MRU',
        siege_social:          mm.siege_social          || '',
      },
    });
  }
  return vals;
};

// ─── Helper : convertit les gérants API → lignes de tableau form ─────────────
const _apiGerantsToRows = (gerantsApi) =>
  (gerantsApi || []).filter(g => g.actif !== false).map(g => ({
    _key:          g.id,
    nom:           g.nom_gerant                    || '',
    prenom:        g.donnees_ident?.prenom         || '',
    date_naissance: g.donnees_ident?.date_naissance
                   ? dayjs(g.donnees_ident.date_naissance) : null,
    lieu_naissance: g.donnees_ident?.lieu_naissance || '',
    type_document:  g.donnees_ident?.type_document  || '',
    nni:            g.donnees_ident?.nni            || '',
    num_passeport:  g.donnees_ident?.num_passeport  || '',
    telephone:      g.donnees_ident?.telephone      || '',
    domicile:       g.donnees_ident?.domicile       || '',
    nationalite_id: g.nationalite                  || undefined,
    fonction_id:    g.fonction                     || undefined,
    date_debut:     g.date_debut ? dayjs(g.date_debut) : null,
    pouvoirs:       g.pouvoirs                     || '',
  }));

// ─── Helper : convertit les associés API → lignes de tableau form ────────────
const _apiAssociesToRows = (associesApi) =>
  (associesApi || []).filter(a => a.actif !== false).map(a => {
    const di = a.donnees_ident || {};
    return {
      _key:          a.id,
      type_associe:  a.type_associe  || 'PH',
      nom:           a.nom_associe   || '',
      prenom:        (a.donnees_ident || {}).prenom || '',
      nationalite_id: a.nationalite  || undefined,
      nombre_parts:  a.nombre_parts  || undefined,
      valeur_parts:  a.valeur_parts  || undefined,
      pourcentage:   a.pourcentage   ? parseFloat(a.pourcentage) : undefined,
      type_part:     a.type_part     || '',
      // Identification PH
      date_naissance:   di.date_naissance   ? dayjs(di.date_naissance)   : null,
      lieu_naissance:   di.lieu_naissance   || '',
      nni:              di.nni              || '',
      num_passeport:    di.num_passeport    || '',
      // Identification PM
      numero_rc:        di.numero_rc        || '',
      date_immatriculation: di.date_immatriculation ? dayjs(di.date_immatriculation) : null,
    };
  });

// ─── Helper : convertit les administrateurs API → lignes de tableau form ─────
const _apiAdminToRows = (adminsApi) =>
  (adminsApi || []).filter(a => a.actif !== false).map(a => ({
    _key:           a.id,
    nom:            a.nom            || '',
    prenom:         a.prenom         || '',
    nom_ar:         a.nom_ar         || '',
    prenom_ar:      a.prenom_ar      || '',
    nationalite_id: a.nationalite    || undefined,
    nni:            a.nni            || '',
    num_passeport:  a.num_passeport  || '',
    date_naissance: a.date_naissance ? dayjs(a.date_naissance) : null,
    lieu_naissance: a.lieu_naissance || '',
    adresse:        a.adresse        || '',
    telephone:      a.telephone      || '',
    email:          a.email          || '',
    fonction:       a.fonction       || '',
    date_debut:     a.date_debut     ? dayjs(a.date_debut) : null,
    date_fin:       a.date_fin       ? dayjs(a.date_fin)   : null,
  }));

// ─── Helper : convertit les commissaires API → lignes de tableau form ─────────
const _apiCommissairesToRows = (commissairesApi) =>
  (commissairesApi || []).filter(c => c.actif !== false).map(c => ({
    _key:             c.id,
    type_commissaire: c.type_commissaire || 'PH',
    role:             c.role             || 'TITULAIRE',
    nom:              c.nom              || '',
    prenom:           c.prenom           || '',
    nom_ar:           c.nom_ar           || '',
    nationalite_id:   c.nationalite      || undefined,
    nni:              c.nni              || '',
    num_passeport:    c.num_passeport    || '',
    date_naissance:   c.date_naissance   ? dayjs(c.date_naissance) : null,
    lieu_naissance:   c.lieu_naissance   || '',
    adresse:          c.adresse          || '',
    telephone:        c.telephone        || '',
    email:            c.email            || '',
    date_debut:       c.date_debut       ? dayjs(c.date_debut) : null,
    date_fin:         c.date_fin         ? dayjs(c.date_fin)   : null,
  }));


const FormulaireRChrono = () => {
  // ── Mode rectification (URL /:id/rectifier) vs création (/nouveau) ──────────
  // Le paramètre :id n'est présent que sur la route /:id/rectifier.
  // La route /nouveau n'a pas de :id, donc rcId sera undefined en mode création.
  const { id: rcId }  = useParams();
  const modeRectif    = !!rcId;   // true seulement sur /:id/rectifier

  const [typeEntite,       setTypeEntite]       = useState(null);
  const [gerants,          setGerants]          = useState([]);
  const [associes,         setAssocies]         = useState([]);
  const [directeurs,       setDirecteurs]       = useState([]);
  const [administrateurs,  setAdministrateurs]  = useState([]);
  const [commissaires,     setCommissaires]     = useState([]);
  const [gerantLuiMeme,    setGerantLuiMeme]    = useState(false);
  const [fileList,         setFileList]         = useState([]);
  // ── État doublon (soumission finale) ────────────────────────────────────────
  const [doublonBlock,     setDoublonBlock]     = useState(null);  // { type, motif, ra_existant }
  const [doublonWarn,      setDoublonWarn]      = useState(null);  // { warnings[], pendingPayload }
  // ── État doublon temps réel (désactivé en mode rectification) ───────────────
  const [doublonRealtime,  setDoublonRealtime]  = useState(null);
  const [checkingDoublon,  setCheckingDoublon]  = useState(false);
  const checkTimerRef = useRef(null); // debounce ref
  // ── Mineur (PH uniquement) ──────────────────────────────────────────────────
  const [isMineur,         setIsMineur]         = useState(false);
  const [form]  = Form.useForm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, isAr, field } = useLanguage();
  const { hasRole }         = useAuth();
  const isAgentGU           = hasRole('AGENT_GU');

  // ── Chargement des données RC en mode rectification ────────────────────────
  // Les données RA (ph_data, pm_data, etc.) sont embarquées dans la réponse RC
  // via RegistreChronologiqueDetailSerializer → plus de requête séparée sur /ra/.
  // Cela permet à l'Agent GU (sans accès à l'endpoint RA) d'éditer ses dossiers.
  const { data: rcData, isLoading: rcLoading } = useQuery({
    queryKey:  ['rchrono-edit', rcId],
    queryFn:   () => registreAPI.getChrono(rcId).then(r => r.data),
    enabled:   modeRectif,
  });

  // ── Pré-remplissage du formulaire dès que les données RC sont disponibles ────
  useEffect(() => {
    if (!modeRectif || !rcData) return;

    // Les données RA sont embarquées dans rcData (ra_type_entite, ra_ph_data, …)
    const te = rcData.ra_type_entite || '';
    setTypeEntite(te);

    // Gérants / directeurs / associés (depuis les données RA embarquées)
    const gerantsRows = _apiGerantsToRows(rcData.ra_gerants);
    if (te === 'SC') {
      setDirecteurs(gerantsRows);
      setGerants([]);
      setGerantLuiMeme(false);
    } else if (te === 'PH') {
      const descParsed = rcData.description_parsed || {};
      const estLuiMeme = descParsed.gerant_lui_meme === true || gerantsRows.length === 0;
      setGerantLuiMeme(estLuiMeme);
      setGerants(estLuiMeme ? [] : gerantsRows);
    } else {
      setGerantLuiMeme(false);
      setGerants(gerantsRows);
    }
    setAssocies(_apiAssociesToRows(rcData.ra_associes));
    setAdministrateurs(_apiAdminToRows(rcData.ra_administrateurs));
    setCommissaires(_apiCommissairesToRows(rcData.ra_commissaires));

    // Construire un objet raData synthétique depuis les champs ra_* embarqués
    const raDataEmbedded = {
      type_entite: te,
      ph_data:     rcData.ra_ph_data   || null,
      pm_data:     rcData.ra_pm_data   || null,
      sc_data:     rcData.ra_sc_data   || null,
      localite:    rcData.ra_localite  || undefined,
      gerants:     rcData.ra_gerants   || [],
      associes:    rcData.ra_associes  || [],
      domaines:    rcData.ra_domaines  || [],
    };

    // Valeurs du formulaire — délai court pour laisser typeEntite se propager
    const vals = _apiToFormValues(rcData, raDataEmbedded);
    setTimeout(() => form.setFieldsValue(vals), 80);
  }, [modeRectif, rcData]); // eslint-disable-line

  // ── Callback vérification doublon temps réel (debounce 300 ms) ──────────────
  const checkDoublonRealtime = useCallback((params) => {
    // Annuler l'appel en attente
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);

    // Réinitialiser si aucun paramètre utile
    if (!params) { setDoublonRealtime(null); return; }

    checkTimerRef.current = setTimeout(async () => {
      try {
        setCheckingDoublon(true);
        const resp = await registreAPI.checkDoublon(params);
        const data = resp.data;
        setDoublonRealtime(data.type ? data : null);
      } catch (_) {
        /* erreur réseau silencieuse — ne pas bloquer la saisie */
      } finally {
        setCheckingDoublon(false);
      }
    }, 300);
  }, []);

  const TYPE_CONFIG = {
    PH: { label: t('entity.ph'), color: '#1a4480', icon: '👤' },
    PM: { label: t('entity.pm'), color: '#2e7d32', icon: '🏢' },
    SC: { label: t('entity.sc'), color: '#b45309', icon: '🌐' },
  };

  const { nationalites, fonctions, domaines, formes, localites } = useParamData();

  // ── Upload des pièces jointes après création ou rectification ───────────
  const _uploadFiles = async (response) => {
    if (fileList.length === 0) return;
    const chronoId = response.data?.id;
    const raId     = response.data?.ra;

    let nbOk = 0;
    let nbKo = 0;

    const uploads = fileList.map(async (f) => {
      const fd = new FormData();
      // RcFile (ant design) hérite de File — originFileObj n'est pas défini ici
      fd.append('fichier', f.originFileObj || f);
      fd.append('nom_fichier', (f.originFileObj || f).name || f.name || 'document');
      if (chronoId) fd.append('chrono', chronoId);
      if (raId)     fd.append('ra',     raId);
      try {
        await documentAPI.upload(fd);
        nbOk++;
      } catch (err) {
        nbKo++;
        console.error('Erreur upload pièce jointe :', err?.response?.data || err);
      }
    });

    await Promise.all(uploads);

    if (nbKo > 0) {
      message.warning(
        `${nbOk} pièce(s) jointe(s) uploadée(s) avec succès, `
        + `${nbKo} échec(s). Vérifiez les documents dans le détail du dossier.`,
        6,
      );
    }
  };

  const createMut = useMutation({
    mutationFn: (data) => registreAPI.enregistrementInitial(data),
    onSuccess: async (response, sentPayload) => {
      const data = response.data;

      // ── Doublon potentiel : le backend répond 200 avec un avertissement ──
      if (data?.doublon_potentiel) {
        setDoublonWarn({
          warnings:       data.warnings || [],
          pendingPayload: sentPayload,   // payload original passé à mutate()
        });
        return;
      }

      // ── Succès réel (201 ou 200 sans doublon) ───────────────────────────
      await _uploadFiles(response);
      message.success(t('msg.saved'));
      navigate('/registres/chronologique');
    },
    onError: (e) => {
      const err    = e.response?.data;
      const status = e.response?.status;

      // ── Doublon confirmé (409) ───────────────────────────────────────────
      if (status === 409 && err?.doublon) {
        setDoublonBlock(err);
        return;
      }

      // ── Règles métier bloquantes (400) ───────────────────────────────────
      if (status === 400 && err?.code === 'MINEUR_BLOQUE') {
        message.error({ content: err.detail, duration: 8 });
        return;
      }
      if (status === 400 && err?.code === 'GERANT_MINEUR') {
        message.error({ content: err.detail, duration: 8 });
        return;
      }
      if (status === 400 && err?.code === 'NNI_INVALIDE') {
        message.error({ content: err.detail, duration: 6 });
        return;
      }

      message.error(typeof err === 'string' ? err : err?.detail || t('msg.error'));
    },
  });

  // ── Mutation : rectification/modification d'un dossier existant ──────────
  // • BROUILLON : sauvegarde uniquement (pas d'envoi automatique)
  // • RETOURNE  : sauvegarde + envoi automatique au greffier (EN_INSTANCE)
  const isBrouillon = rcData?.statut === 'BROUILLON';

  const rectifyMut = useMutation({
    mutationFn: async (data) => {
      // 1. Sauvegarder les corrections
      const res = await registreAPI.rectifierChrono(rcId, data);
      // 2. Soumettre au greffier UNIQUEMENT si le dossier était RETOURNE
      if (!isBrouillon) {
        try {
          await registreAPI.envoyerChrono(rcId);
        } catch {
          // Corrections sauvegardées même si l'envoi échoue
        }
      }
      return res;
    },
    onSuccess: async (response) => {
      await _uploadFiles(response);

      queryClient.invalidateQueries({ queryKey: ['rchrono'] });
      queryClient.invalidateQueries({ queryKey: ['rchrono-retourne-count'] });
      queryClient.invalidateQueries({ queryKey: ['rchrono-brouillon-count'] });
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', rcId] });
      queryClient.invalidateQueries({ queryKey: ['rchrono-edit',   rcId] });
      queryClient.invalidateQueries({ queryKey: ['ra'] });

      if (isBrouillon) {
        message.success(isAr ? 'تم حفظ الملف.' : 'Dossier modifié et sauvegardé.');
      } else {
        message.success(isAr ? 'تم إرسال الملف إلى أمين السجل.' : 'Dossier corrigé et soumis au greffier.');
      }
      navigate('/registres/chronologique');
    },
    onError: (e) => {
      const err = e.response?.data;
      message.error(typeof err === 'string' ? err : err?.detail || t('msg.error'));
    },
  });

  // ── Confirmation : l'agent force malgré l'avertissement ──────────────────
  const handleForceConfirm = () => {
    if (!doublonWarn?.pendingPayload) return;
    setDoublonWarn(null);
    createMut.mutate({ ...doublonWarn.pendingPayload, force: true });
  };

  // ── Préparation du payload commun ────────────────────────────────────────
  const _buildPayload = (values, associesOverride = null) => {
    // date_acte est un DateTimeField : on envoie la date ET l'heure (ISO 8601)
    const fmtDate     = (v) => (v && dayjs.isDayjs(v)) ? v.format('YYYY-MM-DD')             : (v || null);
    const fmtDatetime = (v) => (v && dayjs.isDayjs(v)) ? v.format('YYYY-MM-DDTHH:mm:ss')    : (v || null);

    // date_acte → datetime complet ; autres champs → date seule
    if (values['date_acte']) values['date_acte'] = fmtDatetime(values['date_acte']);
    const dateFields = ['date_naissance', 'date_depot_statuts'];
    dateFields.forEach(f => { if (values[f]) values[f] = fmtDate(values[f]); });
    if (values.maison_mere) {
      ['date_depot_statuts', 'date_immatriculation'].forEach(f => {
        if (values.maison_mere[f]) values.maison_mere[f] = fmtDate(values.maison_mere[f]);
      });
    }
    const processGerant = g => ({
      ...g,
      date_debut:     fmtDate(g.date_debut),
      date_naissance: fmtDate(g.date_naissance),
    });
    const processAssoc = a => ({
      ...a,
      date_naissance:       fmtDate(a.date_naissance),
      date_immatriculation: fmtDate(a.date_immatriculation),
    });

    // ── Données structurées du déclarant ──────────────────────────────────
    const declarant_data = {
      nom:            values.declarant_nom            || '',
      prenom:         values.declarant_prenom         || '',
      nni:            values.declarant_nni            || '',
      num_passeport:  values.declarant_num_passeport  || '',
      date_naissance: fmtDate(values.declarant_date_naissance),
      lieu_naissance: values.declarant_lieu_naissance || '',
      nationalite_id: values.declarant_nationalite_id || null,
    };

    // Retirer les champs préfixés declarant_ du payload racine
    const {
      declarant_nom, declarant_prenom, declarant_nni, declarant_num_passeport,
      declarant_date_naissance, declarant_lieu_naissance, declarant_nationalite_id,
      ...rest
    } = values;

    const processOrgane = o => {
      const r = {
        ...o,
        date_debut:     fmtDate(o.date_debut),
        date_fin:       fmtDate(o.date_fin),
        date_naissance: fmtDate(o.date_naissance),
      };
      // Cohérence bilingue : en mode AR, nom_ar est le champ primaire saisi.
      // On recopie nom_ar → nom si nom est vide (contrainte NOT NULL en base).
      if (!r.nom && r.nom_ar) r.nom = r.nom_ar;
      return r;
    };

    // ── Synchronisation dénomination bilingue ────────────────────────────────
    // La dénomination est une déclaration juridique libre : peut contenir arabe,
    // latin, sigles, chiffres. Les deux champs (denomination / denomination_ar)
    // doivent être cohérents pour garantir l'affichage dans les deux interfaces.
    if (rest.denomination && !rest.denomination_ar) rest.denomination_ar = rest.denomination;
    if (rest.denomination_ar && !rest.denomination) rest.denomination    = rest.denomination_ar;

    return {
      ...rest,
      type_entite:     typeEntite,
      gerant_lui_meme: gerantLuiMeme,
      gerants:         [...gerants, ...(typeEntite === 'SC' ? directeurs : [])].map(processGerant),
      associes:        (associesOverride || associes).map(processAssoc),
      administrateurs: administrateurs.map(processOrgane),
      commissaires:    commissaires.map(processOrgane),
      declarant_data,
      // ── Langue de l'acte : déterminée à la création par la langue de l'interface ──
      langue_acte:     isAr ? 'ar' : 'fr',
    };
  };

  const onFinish = (values) => {
    // ── Validation règle métier : total % associés = 100 (PM uniquement) ──
    if (typeEntite === 'PM' && associes.length > 0) {
      const total = totalPourcentage(associes);
      if (Math.abs(total - 100) >= 0.01) {
        message.error({
          content: `Le total des parts sociales doit être égal à 100 % (actuel : ${parseFloat(total.toFixed(2))} %)`,
          duration: 5,
        });
        return;
      }

    }

    // ── Recalcul final des valeur_parts avant soumission ──────────────────────
    // Garantit la cohérence définitive quel que soit l'ordre de saisie.
    let associesFinaux = associes;
    if (typeEntite === 'PM' && associes.length > 0) {
      const cs = parseFloat(values.capital_social) || 0;
      if (cs > 0) {
        associesFinaux = associes.map(a => {
          const pct = parseFloat(a.pourcentage);
          if (!pct) return a;
          return { ...a, valeur_parts: Math.round(pct * cs / 100 * 100) / 100 };
        });
      }
    }

    const payload = _buildPayload(values, associesFinaux);

    if (modeRectif) {
      // ── Mode rectification : PATCH sur le RC existant ──────────────────
      rectifyMut.mutate(payload);
    } else {
      // ── Mode création : POST enregistrement initial ─────────────────────
      setDoublonBlock(null);
      setDoublonWarn(null);
      createMut.mutate(payload);
    }
  };

  // ── Indicateur de chargement en mode rectification ──────────────────────
  if (modeRectif && rcLoading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 0', textAlign: 'center' }}>
        <Alert type="info" showIcon message="Chargement du dossier en cours…" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/registres/chronologique')}>
          {t('action.back')}
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {modeRectif
            ? (isBrouillon
                ? `✏️ ${t('action.rectifier')}`
                : `✏️ ${t('action.corrigerDossier')}`)
            : `📅 ${t('form.title')}`}
        </Title>
        {modeRectif && rcData && (
          <Tag color="orange" style={{ fontSize: 13 }}>
            {rcData.numero_chrono ? fmtChrono(rcData.numero_chrono) : `RC #${rcId}`}
          </Tag>
        )}
      </div>

      {modeRectif && rcData?.statut === 'RETOURNE' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Dossier retourné pour correction"
          description={rcData.observations || 'Le greffier a retourné ce dossier. Veuillez apporter les corrections nécessaires puis renvoyer.'}
        />
      )}

      {/* Étape 1 — Sélection du type (création uniquement) */}
      {!modeRectif && (
        <Card title={`${isAr ? 'الخطوة 1' : 'Étape 1'} — ${t('form.choose_type')}`} style={{ marginBottom: 16 }}>
          <Row gutter={16} justify="center">
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <Col key={key} xs={24} sm={8}>
                <Card
                  hoverable
                  onClick={() => { setTypeEntite(key); setGerants([]); setAssocies([]); setDirecteurs([]); setAdministrateurs([]); setCommissaires([]); setGerantLuiMeme(key === 'PH'); form.resetFields(); setDoublonRealtime(null); setDoublonBlock(null); setIsMineur(false); }}
                  style={{
                    textAlign: 'center',
                    border:     typeEntite === key ? `2px solid ${cfg.color}` : '1px solid #d9d9d9',
                    background: typeEntite === key ? `${cfg.color}10` : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 36 }}>{cfg.icon}</div>
                  <Text strong style={{ color: typeEntite === key ? cfg.color : 'inherit' }}>{cfg.label}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {typeEntite && (
        <Form form={form} layout="vertical" onFinish={onFinish}>

          {/* Informations d'enregistrement */}
          <Card
            title={<span style={{ color: TYPE_CONFIG[typeEntite].color }}>
              {modeRectif
                ? `📋 ${t('form.date_acte')} / ${t('form.localite')}`
                : `${isAr ? 'الخطوة 2' : 'Étape 2'} — ${t('form.date_acte')} / ${t('form.localite')}`}
            </span>}
            style={{ marginBottom: 16 }}
          >
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="date_acte"
                  label={t('form.date_acte')}
                  rules={[{ required: true }]}
                  initialValue={dayjs()}
                  extra={<span style={{ fontSize: 11, color: '#888' }}>Horodatage légal de l'acte (date + heure obligatoires)</span>}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    showTime={{ format: 'HH:mm' }}
                    format="DD/MM/YYYY HH:mm"
                    placeholder="JJ/MM/AAAA HH:mm"
                  />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="localite_id" label={t('form.localite')}>
                  <Select showSearch placeholder={t('form.localite')}
                    options={localites.map(l => ({ value: l.id, label: field(l, 'libelle') }))} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Données de l'entité */}
          <Card
            title={<span style={{ color: TYPE_CONFIG[typeEntite].color }}>
              {modeRectif
                ? `${TYPE_CONFIG[typeEntite].icon} ${TYPE_CONFIG[typeEntite].label}`
                : `${isAr ? 'الخطوة 3' : 'Étape 3'} — ${TYPE_CONFIG[typeEntite].label}`}
            </span>}
            style={{ marginBottom: 16 }}
          >
            {typeEntite === 'PH' && (
              <SectionPH
                nationalites={nationalites} fonctions={fonctions} domaines={domaines}
                gerants={gerants} setGerants={setGerants}
                onCheckDoublon={modeRectif ? null : checkDoublonRealtime}
                doublonResult={modeRectif ? null : doublonRealtime}
                doublonLoading={modeRectif ? false : checkingDoublon}
                isMineur={isMineur}
                onMineurChange={setIsMineur}
                gerantLuiMeme={gerantLuiMeme}
                setGerantLuiMeme={setGerantLuiMeme}
              />
            )}
            {typeEntite === 'PM' && (
              <SectionPM
                nationalites={nationalites} fonctions={fonctions} domaines={domaines} formes={formes}
                gerants={gerants} setGerants={setGerants}
                associes={associes} setAssocies={setAssocies}
                administrateurs={administrateurs} setAdministrateurs={setAdministrateurs}
                commissaires={commissaires} setCommissaires={setCommissaires}
                onCheckDoublon={modeRectif ? null : checkDoublonRealtime}
                doublonResult={modeRectif ? null : doublonRealtime}
                doublonLoading={modeRectif ? false : checkingDoublon}
              />
            )}
            {typeEntite === 'SC' && (
              <SectionSC
                nationalites={nationalites} fonctions={fonctions} domaines={domaines} formes={formes}
                directeurs={directeurs} setDirecteurs={setDirecteurs}
                onCheckDoublon={modeRectif ? null : checkDoublonRealtime}
                doublonResult={modeRectif ? null : doublonRealtime}
                doublonLoading={modeRectif ? false : checkingDoublon}
              />
            )}
          </Card>

          {/* Déclarant — commun à tous les types */}
          <SectionDeclarant nationalites={nationalites} />

          {/* Déclaration bénéficiaire effectif — uniquement PM et SC, pas PH */}
          {typeEntite !== 'PH' && (
            <Card
              title={
                <Space>
                  <span style={{ color: '#d46b08' }}>⚖️</span>
                  <span style={{ color: '#d46b08', fontWeight: 600 }}>
                    {isAr ? 'إعلان المستفيد الفعلي' : 'Déclaration du bénéficiaire effectif'}
                  </span>
                </Space>
              }
              style={{ marginBottom: 16, borderColor: '#faad14', background: '#fffbe6' }}
            >
              <Alert
                type="warning"
                showIcon
                message={isAr
                  ? 'هذا الحقل إلزامي وفق المادة 63 من المرسوم رقم 2021-033'
                  : 'Ce champ est obligatoire conformément à l\'article 63 du décret n°2021-033.'}
                style={{ marginBottom: 12 }}
              />
              <Form.Item
                name="choix_be"
                rules={[{ required: true, message: isAr ? 'يرجى تحديد خيار المستفيد الفعلي' : 'Veuillez choisir une option pour le bénéficiaire effectif.' }]}
              >
                <Radio.Group>
                  <Space direction="vertical">
                    <Radio value="immediat">
                      <span style={{ fontWeight: 500 }}>
                        {isAr ? '✅ تم الإعلان فوراً' : '✅ Déclaré immédiatement'}
                      </span>
                      <br />
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {isAr
                          ? 'سيتم تسجيل المستفيد الفعلي مباشرة عند التسجيل'
                          : 'Le bénéficiaire effectif est déclaré dès l\'immatriculation.'}
                      </span>
                    </Radio>
                    <Radio value="15_jours">
                      <span style={{ fontWeight: 500 }}>
                        {isAr ? '⏳ سيتم الإعلان في غضون 15 يوماً' : '⏳ Sera déclaré dans un délai de 15 jours'}
                      </span>
                      <br />
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {isAr
                          ? 'يجب تقديم الإعلان خلال 15 يوماً من تاريخ التسجيل'
                          : 'La déclaration doit être effectuée dans les 15 jours suivant l\'immatriculation.'}
                      </span>
                    </Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>
            </Card>
          )}

          {/* Pièces jointes — visibles pour tous (BROUILLON / RETOURNE uniquement) */}
          <Card
            title={<Space><PaperClipOutlined /><span>{isAr ? 'المستندات المرفقة' : 'Pièces jointes'}</span></Space>}
            style={{ marginBottom: 16 }}
          >
            <Upload
              multiple
              beforeUpload={(file) => {
                setFileList(prev => [...prev, file]);
                return false;          // empêche l'upload automatique
              }}
              onRemove={(file) => {
                setFileList(prev => prev.filter(f => f.uid !== file.uid));
              }}
              onPreview={(file) => {
                const raw = file.originFileObj || file;
                if (!raw) return;
                const url = URL.createObjectURL(raw);
                const a = document.createElement('a');
                a.href   = url;
                a.target = '_blank';
                a.rel    = 'noopener noreferrer';
                // Pour les PDF/images : ouvrir dans un nouvel onglet
                // Pour les autres formats (docx, xlsx…) : forcer le téléchargement
                const ext = (file.name || '').split('.').pop().toLowerCase();
                const inlineable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                if (!inlineable) a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              }}
              fileList={fileList}
              showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
            >
              <Button icon={<UploadOutlined />} style={{ borderColor: '#1a4480', color: '#1a4480' }}>
                {isAr ? 'إضافة مرفق' : 'Ajouter une pièce jointe'}
              </Button>
            </Upload>
            {fileList.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                {fileList.length} {isAr ? 'ملف(ات) محدد' : `fichier${fileList.length > 1 ? 's' : ''} sélectionné${fileList.length > 1 ? 's' : ''}`}
              </Text>
            )}
          </Card>

          {/* Observations */}
          <Card title={t('field.observations')} style={{ marginBottom: 24 }}>
            <Form.Item name="observations">
              <TextArea rows={3} />
            </Form.Item>
          </Card>

          {/* ── Doublon confirmé ─────────────────────────────────────────────── */}
          {doublonBlock && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <span style={{ fontWeight: 600 }}>
                  🚫 Doublon confirmé — immatriculation impossible
                </span>
              }
              description={
                <div>
                  <p style={{ margin: '4px 0' }}>{doublonBlock.motif}</p>
                  {doublonBlock.ra_existant && (
                    <p style={{ margin: '4px 0', fontSize: 13 }}>
                      Dossier existant :{' '}
                      <strong>{doublonBlock.ra_existant.numero_ra}</strong>
                      {doublonBlock.ra_existant.nom && (
                        <> — {doublonBlock.ra_existant.nom} {doublonBlock.ra_existant.prenom}</>
                      )}
                      {doublonBlock.ra_existant.nni && (
                        <> (NNI : {doublonBlock.ra_existant.nni})</>
                      )}
                      {doublonBlock.ra_existant.numero_rc && (
                        <> — RC : {doublonBlock.ra_existant.numero_rc}</>
                      )}
                      {' '}— Statut : <Tag color="red">{doublonBlock.ra_existant.statut}</Tag>
                    </p>
                  )}
                </div>
              }
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => navigate('/registres/chronologique')}>
              {t('action.cancel')}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={modeRectif ? rectifyMut.isPending : createMut.isPending}
              disabled={!modeRectif && (!!doublonBlock || doublonRealtime?.type === 'DOUBLON_CONFIRME' || isMineur)}
              icon={<SaveOutlined />}
              style={{ background: (modeRectif && !isBrouillon) ? '#d46b08' : '#1a4480' }}
            >
              {modeRectif
                ? (isBrouillon ? t('form.save_brouillon') : t('action.soumettreNouveau'))
                : t('form.save_brouillon')}
            </Button>
          </div>
        </Form>
      )}

      {/* ── Modal doublon potentiel ─────────────────────────────────────────── */}
      <Modal
        open={!!doublonWarn}
        title={
          <Space>
            <span style={{ color: '#d46b08', fontSize: 18 }}>⚠️</span>
            <span style={{ color: '#d46b08' }}>Doublon potentiel détecté</span>
          </Space>
        }
        onCancel={() => setDoublonWarn(null)}
        footer={[
          <Button key="cancel" onClick={() => setDoublonWarn(null)}>
            Annuler
          </Button>,
          <Button
            key="force"
            type="primary"
            danger
            loading={createMut.isPending}
            onClick={handleForceConfirm}
          >
            Confirmer malgré l'alerte
          </Button>,
        ]}
        width={560}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Le système a détecté une similarité avec un dossier existant."
        />
        {(doublonWarn?.warnings || []).map((w, i) => (
          <p key={i} style={{ margin: '6px 0', paddingLeft: 8, borderLeft: '3px solid #faad14' }}>
            {w}
          </p>
        ))}
        <p style={{ marginTop: 16, color: '#555' }}>
          Souhaitez-vous tout de même créer ce dossier ?
          <br />
          <span style={{ fontSize: 12, color: '#888' }}>
            Si vous êtes certain qu'il ne s'agit pas du même assujetti, cliquez sur
            « Confirmer malgré l'alerte ».
          </span>
        </p>
      </Modal>
    </div>
  );
};

export default FormulaireRChrono;

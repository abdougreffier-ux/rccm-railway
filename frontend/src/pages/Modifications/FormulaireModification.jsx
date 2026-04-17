import React, { useState, useEffect } from 'react';
import {
  Form, Input, InputNumber, Button, Card, Row, Col,
  Alert, Spin, Typography, Select, Space, message,
  Descriptions, Tag, Divider, DatePicker, Table, Modal, Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, SendOutlined, WarningOutlined,
  InfoCircleOutlined, EditOutlined, FileTextOutlined, PaperClipOutlined,
  PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modifAPI, parametrageAPI, documentAPI } from '../../api/api';
import { PiecesJointesPending } from '../../components/PiecesJointesCard';
import { useLanguage } from '../../contexts/LanguageContext';
import NniInput, { uppercaseRule, nniRule } from '../../components/NniInput';
import { getCiviliteOptions } from '../../utils/civilite';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Couleurs statut ───────────────────────────────────────────────────────────
const STATUT_COLOR = {
  IMMATRICULE: 'success', EN_INSTANCE_VALIDATION: 'processing',
  RETOURNE: 'warning', REJETE: 'error', RADIE: 'default',
};

// ── Devises ───────────────────────────────────────────────────────────────────
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
      {DEVISES.map(d => <Option key={d.value} value={d.value}>{isAr ? d.label_ar : d.label_fr}</Option>)}
    </Select>
  );
};

// ── TableEditable — tableau avec ajout/édition/suppression en modal ──────────
const TableEditable = ({ title, rows, setRows, columns, formFields, initialValues = {} }) => {
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(null);
  const [tform]   = Form.useForm();
  const { isAr }  = useLanguage();

  const openAdd  = () => { setEditing(null); tform.resetFields(); tform.setFieldsValue(initialValues); setOpen(true); };
  const openEdit = (row) => { setEditing(row); tform.setFieldsValue(row); setOpen(true); };
  const handleDelete = (key) => setRows(prev => prev.filter(r => r._key !== key));

  const handleOk = () => {
    tform.validateFields().then(vals => {
      if (editing) {
        setRows(prev => prev.map(r => r._key === editing._key ? { ...r, ...vals } : r));
      } else {
        setRows(prev => [...prev, { ...vals, _key: Date.now() }]);
      }
      setOpen(false);
    });
  };

  const actionCol = {
    title: isAr ? 'إجراءات' : 'Actions', key: 'act', width: 90, fixed: 'right',
    render: (_, r) => (
      <Space>
        <Tooltip title={isAr ? 'تعديل' : 'Modifier'}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Tooltip>
        <Tooltip title={isAr ? 'حذف' : 'Supprimer'}>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r._key)} />
        </Tooltip>
      </Space>
    ),
  };

  return (
    <Card
      size="small"
      title={<Text strong>{title}</Text>}
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}
          style={{ background: '#1a4480' }}>
          {isAr ? 'إضافة' : 'Ajouter'}
        </Button>
      }
      style={{ marginBottom: 12 }}
    >
      <Table
        dataSource={rows}
        columns={[...columns, actionCol]}
        rowKey="_key"
        size="small"
        pagination={false}
        locale={{ emptyText: isAr ? 'لا توجد بيانات' : 'Aucune donnée' }}
        scroll={{ x: 'max-content' }}
      />
      <Modal
        title={editing
          ? (isAr ? `تعديل — ${title}` : `Modifier — ${title}`)
          : (isAr ? `إضافة — ${title}` : `Ajouter — ${title}`)}
        open={open}
        onOk={handleOk}
        onCancel={() => setOpen(false)}
        width={700}
        okText={isAr ? 'تأكيد' : 'Confirmer'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        destroyOnClose
      >
        <Form form={tform} layout="vertical" style={{ marginTop: 16 }}>
          {formFields}
        </Form>
      </Modal>
    </Card>
  );
};

// ── AdminFormFieldsMod — champs administrateur SA (modification) ──────────────
const AdminFormFieldsMod = ({ nationalites }) => {
  const { t, isAr } = useLanguage();
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
          <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
        </Form.Item>
      </Col>
      {!isAr && <Col span={8}><Form.Item name="nom"    label="Nom"    rules={[{ required: true }, uppercaseRule(false)]}><Input /></Form.Item></Col>}
      {!isAr && <Col span={8}><Form.Item name="prenom" label="Prénom"><Input /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="nom_ar"    label="الاسم"  rules={[{ required: true, message: 'الاسم مطلوب' }]}><Input dir="rtl" /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="prenom_ar" label="اللقب"><Input dir="rtl" /></Form.Item></Col>}
      <Col span={12}>
        <Form.Item name="nationalite_id" label={isAr ? 'الجنسية' : 'Nationalité'}>
          <Select showSearch allowClear
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="nni" label="NNI" rules={[nniRule(null)]}><NniInput /></Form.Item></Col>
      <Col span={12}><Form.Item name="num_passeport" label={isAr ? 'رقم الجواز' : 'N° Passeport'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_naissance" label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={12}><Form.Item name="lieu_naissance" label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}><Input /></Form.Item></Col>
      <Col span={12}>
        <Form.Item name="fonction" label={isAr ? 'المهمة في مجلس الإدارة' : 'Fonction au CA'}
          tooltip={isAr ? 'مثال: رئيس، نائب' : 'Ex. : Président, Administrateur délégué'}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="date_debut" label={isAr ? 'تاريخ التعيين' : 'Date de prise de fonction'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_fin"   label={isAr ? 'تاريخ انتهاء المهمة' : 'Date de fin de mandat'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={24}><Form.Item name="adresse"   label={isAr ? 'العنوان' : 'Adresse'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="telephone" label={isAr ? 'الهاتف' : 'Téléphone'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="email"     label={isAr ? 'البريد الإلكتروني' : 'E-mail'}><Input type="email" /></Form.Item></Col>
    </Row>
  );
};

// ── DirigentFormFieldsMod — champs dirigeant SA (DG/PDG) ─────────────────────
const DirigentFormFieldsMod = ({ nationalites }) => {
  const { t, isAr } = useLanguage();
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
          <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
        </Form.Item>
      </Col>
      {!isAr && <Col span={8}><Form.Item name="nom"    label="Nom"    rules={[{ required: true }, uppercaseRule(false)]}><Input /></Form.Item></Col>}
      {!isAr && <Col span={8}><Form.Item name="prenom" label="Prénom"><Input /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="nom_ar"    label="الاسم"  rules={[{ required: true, message: 'الاسم مطلوب' }]}><Input dir="rtl" /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="prenom_ar" label="اللقب"><Input dir="rtl" /></Form.Item></Col>}
      <Col span={12}>
        <Form.Item name="fonction" label={isAr ? 'المنصب' : 'Fonction'}
          tooltip={isAr ? 'مثال: مدير عام، رئيس مجلس الإدارة' : 'Ex. : DG, PDG, Directeur général délégué'}>
          <Select allowClear options={[
            { value: 'PDG',  label: isAr ? 'الرئيس المدير العام'  : 'PDG – Président Directeur Général' },
            { value: 'DG',   label: isAr ? 'المدير العام'          : 'DG – Directeur Général' },
            { value: 'DGD',  label: isAr ? 'المدير العام المساعد'  : 'DGD – Directeur Général Délégué' },
            { value: 'AUTRE', label: isAr ? 'آخر'                  : 'Autre' },
          ]} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="nationalite_id" label={isAr ? 'الجنسية' : 'Nationalité'}>
          <Select showSearch allowClear
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="nni"           label="NNI" rules={[nniRule(null)]}><NniInput /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_naissance" label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={12}><Form.Item name="lieu_naissance" label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}><Input /></Form.Item></Col>
      <Col span={24}><Form.Item name="adresse"   label={isAr ? 'العنوان' : 'Adresse'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="telephone" label={isAr ? 'الهاتف' : 'Téléphone'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="email"     label={isAr ? 'البريد الإلكتروني' : 'E-mail'}><Input type="email" /></Form.Item></Col>
    </Row>
  );
};

// ── CommissaireFormFieldsMod — champs commissaire SA (modification) ───────────
const CommissaireFormFieldsMod = ({ nationalites }) => {
  const { t, isAr } = useLanguage();
  const typeComm = Form.useWatch('type_commissaire');
  const isPHComm = !typeComm || typeComm === 'PH';
  return (
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item name="type_commissaire" label={isAr ? 'النوع' : 'Type'} initialValue="PH">
          <Select options={[
            { value: 'PH', label: isAr ? 'شخص طبيعي' : 'Personne physique' },
            { value: 'PM', label: isAr ? 'شخص معنوي' : 'Personne morale'   },
          ]} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="role" label={isAr ? 'الدور' : 'Rôle'} initialValue="TITULAIRE">
          <Select options={[
            { value: 'TITULAIRE', label: isAr ? 'أصيل' : 'Titulaire' },
            { value: 'SUPPLEANT', label: isAr ? 'نائب' : 'Suppléant' },
          ]} />
        </Form.Item>
      </Col>
      {isPHComm && (
        <Col span={8}>
          <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
            <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
          </Form.Item>
        </Col>
      )}
      {!isAr && (
        <Col span={isPHComm ? 8 : 12}>
          <Form.Item name="nom" rules={[{ required: true }, uppercaseRule(false)]}
            label={isPHComm ? 'Nom' : 'Dénomination sociale'}>
            <Input />
          </Form.Item>
        </Col>
      )}
      {isAr && (
        <Col span={isPHComm ? 8 : 12}>
          <Form.Item name="nom_ar" rules={[{ required: true, message: 'الاسم مطلوب' }]}
            label={isPHComm ? 'الاسم' : 'التسمية الاجتماعية'}>
            <Input dir="rtl" />
          </Form.Item>
        </Col>
      )}
      {isPHComm && !isAr && <Col span={8}><Form.Item name="prenom"    label="Prénom"><Input /></Form.Item></Col>}
      {isPHComm &&  isAr && <Col span={8}><Form.Item name="prenom_ar" label="اللقب"><Input dir="rtl" /></Form.Item></Col>}
      {isPHComm && <Col span={12}><Form.Item name="nni" label="NNI" rules={[nniRule(null)]}><NniInput /></Form.Item></Col>}
      {isPHComm && <Col span={12}><Form.Item name="num_passeport" label={isAr ? 'رقم الجواز' : 'N° Passeport'}><Input /></Form.Item></Col>}
      {isPHComm && <Col span={12}><Form.Item name="date_naissance" label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>}
      <Col span={12}>
        <Form.Item name="nationalite_id" label={isAr ? 'الجنسية' : 'Nationalité'}>
          <Select showSearch allowClear
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="date_debut" label={isAr ? 'تاريخ التعيين' : 'Date de nomination'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_fin"   label={isAr ? 'تاريخ انتهاء المهمة' : 'Date de fin de mandat'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={24}><Form.Item name="adresse"   label={isAr ? 'العنوان' : 'Adresse'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="telephone" label={isAr ? 'الهاتف' : 'Téléphone'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="email"     label={isAr ? 'البريد الإلكتروني' : 'E-mail'}><Input type="email" /></Form.Item></Col>
    </Row>
  );
};

// ── GerantPMFormFields — champs gérant PM non-SA ──────────────────────────────
const GerantPMFormFields = ({ nationalites }) => {
  const { t, isAr } = useLanguage();
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
          <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
        </Form.Item>
      </Col>
      {!isAr && <Col span={8}><Form.Item name="nom"    label="Nom"    rules={[{ required: true }, uppercaseRule(false)]}><Input /></Form.Item></Col>}
      {!isAr && <Col span={8}><Form.Item name="prenom" label="Prénom"><Input /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="nom_ar"    label="الاسم"  rules={[{ required: true, message: 'الاسم مطلوب' }]}><Input dir="rtl" /></Form.Item></Col>}
      {isAr  && <Col span={8}><Form.Item name="prenom_ar" label="اللقب"><Input dir="rtl" /></Form.Item></Col>}
      <Col span={12}>
        <Form.Item name="nationalite_id" label={isAr ? 'الجنسية' : 'Nationalité'}>
          <Select showSearch allowClear
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))} />
        </Form.Item>
      </Col>
      <Col span={12}><Form.Item name="nni" label="NNI" rules={[nniRule(null)]}><NniInput /></Form.Item></Col>
      <Col span={12}><Form.Item name="date_naissance" label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}><Input type="date" style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={12}><Form.Item name="lieu_naissance" label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}><Input /></Form.Item></Col>
      <Col span={12}>
        <Form.Item name="fonction" label={isAr ? 'المهمة / المنصب' : 'Fonction / Qualité'}>
          <Input placeholder={isAr ? 'مثال: مسير أول، مسير مشارك' : 'Ex. : Gérant, Co-gérant'} />
        </Form.Item>
      </Col>
      <Col span={24}><Form.Item name="adresse"   label={isAr ? 'العنوان' : 'Adresse'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="telephone" label={isAr ? 'الهاتف' : 'Téléphone'}><Input /></Form.Item></Col>
      <Col span={12}><Form.Item name="email"     label={isAr ? 'البريد الإلكتروني' : 'E-mail'}><Input type="email" /></Form.Item></Col>
    </Row>
  );
};

// ── Sort options ──────────────────────────────────────────────────────────────
const SORT_OPTIONS_FR = [
  { value: 'MAINTENU',   label: 'Maintenu',      color: '#52c41a' },
  { value: 'DEMISSION',  label: 'Démission',     color: '#fa8c16' },
  { value: 'REVOCATION', label: 'Révocation',    color: '#f5222d' },
  { value: 'FIN_MANDAT', label: 'Fin de mandat', color: '#8c8c8c' },
];
const SORT_OPTIONS_AR = [
  { value: 'MAINTENU',   label: 'مُحتفَظ به',    color: '#52c41a' },
  { value: 'DEMISSION',  label: 'استقالة',       color: '#fa8c16' },
  { value: 'REVOCATION', label: 'إقالة',         color: '#f5222d' },
  { value: 'FIN_MANDAT', label: 'انتهاء المهمة', color: '#8c8c8c' },
];

const _orgNom = (organ, isAr) => {
  if (!organ) return '—';
  const nom    = isAr ? (organ.nom_ar    || organ.nom)    : (organ.nom    || organ.nom_ar);
  const prenom = isAr ? (organ.prenom_ar || organ.prenom) : (organ.prenom || organ.prenom_ar);
  return [prenom, nom].filter(Boolean).join(' ') || organ.fonction || organ.role || '—';
};

// ── OrganeTableMod ─────────────────────────────────────────────────────────────
// Affiche les organes EXISTANTS actifs avec sélecteur de sort juridique
// (MAINTENU / DEMISSION / REVOCATION / FIN_MANDAT) et champs de sortie.
const OrganeTableMod = ({ title, icon, organes = [], events = {}, onUpdateEvent, nationalites, FormFields }) => {
  const { isAr } = useLanguage();
  const [remplacantOrg, setRemplacantOrg] = useState(null);
  const [rForm] = Form.useForm();

  const sortOpts = isAr ? SORT_OPTIONS_AR : SORT_OPTIONS_FR;
  const getEv = (id) => events[id] || { sort: 'MAINTENU', date_effet: '', ref_decision: '', remplacant: null };

  const upd = (id, patch) => {
    const cur = getEv(id);
    onUpdateEvent(id, { ...cur, ...patch });
  };

  const openRemplacant = (org) => {
    const ev = getEv(org.id);
    rForm.resetFields();
    if (ev.remplacant) rForm.setFieldsValue(ev.remplacant);
    setRemplacantOrg(org);
  };
  const saveRemplacant = () => {
    rForm.validateFields().then(vals => {
      upd(remplacantOrg.id, { remplacant: vals });
      setRemplacantOrg(null);
    });
  };

  return (
    <>
      <Card
        size="small"
        title={<Text strong>{icon} {title}</Text>}
        style={{ marginBottom: 12 }}
      >
        {organes.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: '8px 0' }}>
            {isAr ? 'لا توجد بيانات مسجلة.' : 'Aucun organe enregistré.'}
          </Text>
        ) : organes.map((org, idx) => {
          const ev    = getEv(org.id);
          const isSortie = ev.sort !== 'MAINTENU';
          return (
            <div key={org.id} style={{
              padding: '10px 14px',
              background: isSortie ? '#fffbe6' : (idx % 2 === 0 ? '#fafafa' : '#fff'),
              border: `1px solid ${isSortie ? '#ffe58f' : '#f0f0f0'}`,
              borderRadius: 6,
              marginBottom: idx < organes.length - 1 ? 8 : 0,
            }}>
              <Row gutter={12} align="middle">
                <Col flex="auto">
                  <Text strong style={{ fontSize: 13 }}>{_orgNom(org, isAr)}</Text>
                  {(org.fonction || org.role) && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>
                      ({org.fonction || org.role})
                    </Text>
                  )}
                </Col>
                <Col>
                  <Select
                    value={ev.sort}
                    onChange={v => upd(org.id, { sort: v, date_effet: '', ref_decision: '', remplacant: null })}
                    style={{ width: 190 }}
                    options={sortOpts.map(o => ({
                      value: o.value,
                      label: <span style={{ color: o.color, fontWeight: 500 }}>{o.label}</span>,
                    }))}
                  />
                </Col>
              </Row>

              {isSortie && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #ffd666' }}>
                  <Row gutter={12}>
                    <Col xs={24} sm={8}>
                      <div style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {isAr ? '📅 تاريخ السريان' : '📅 Date d\'effet'}
                          <span style={{ color: '#ff4d4f' }}> *</span>
                        </Text>
                      </div>
                      <Input
                        type="date"
                        value={ev.date_effet || ''}
                        onChange={e => upd(org.id, { date_effet: e.target.value })}
                        style={{ width: '100%' }}
                        status={!ev.date_effet ? 'error' : ''}
                      />
                    </Col>
                    <Col xs={24} sm={16}>
                      <div style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {isAr ? '📄 مرجع القرار (مداولة / قرار)' : '📄 Référence de la décision (délibération)'}
                          <span style={{ color: '#ff4d4f' }}> *</span>
                        </Text>
                      </div>
                      <Input
                        value={ev.ref_decision || ''}
                        onChange={e => upd(org.id, { ref_decision: e.target.value })}
                        placeholder={isAr ? 'مثال: قرار الجمعية العامة بتاريخ…' : 'Ex. : Résolution AG du …, PV CA n°…'}
                        status={!ev.ref_decision ? 'error' : ''}
                        dir={isAr ? 'rtl' : 'ltr'}
                      />
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8 }}>
                    {!ev.remplacant ? (
                      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => openRemplacant(org)}
                        style={{ color: '#1a4480', borderColor: '#1a4480' }}>
                        {isAr ? 'تعيين خلف (اختياري)' : 'Désigner un remplaçant (optionnel)'}
                      </Button>
                    ) : (
                      <Space size="small">
                        <Tag color="blue" icon={<InfoCircleOutlined />}>
                          {isAr ? 'الخلف : ' : 'Remplaçant : '}
                          <strong>{_orgNom(ev.remplacant, isAr)}</strong>
                        </Tag>
                        <Button size="small" type="link" onClick={() => openRemplacant(org)}>
                          {isAr ? 'تعديل' : 'Modifier'}
                        </Button>
                        <Button size="small" danger type="link" onClick={() => upd(org.id, { remplacant: null })}>
                          {isAr ? 'حذف' : 'Retirer'}
                        </Button>
                      </Space>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Modal saisie remplaçant */}
      <Modal
        title={isAr ? 'تعيين الخلف' : 'Désigner le remplaçant'}
        open={Boolean(remplacantOrg)}
        onOk={saveRemplacant}
        onCancel={() => { setRemplacantOrg(null); }}
        width={700}
        okText={isAr ? 'تأكيد' : 'Confirmer'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        destroyOnClose
      >
        {remplacantOrg && (
          <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message={isAr
              ? `تعيين خلف لـ : ${_orgNom(remplacantOrg, isAr)}`
              : `Désigner le remplaçant de : ${_orgNom(remplacantOrg, isAr)}`}
          />
        )}
        <Form form={rForm} layout="vertical" style={{ marginTop: 8 }}>
          {FormFields && <FormFields nationalites={nationalites} />}
        </Form>
      </Modal>
    </>
  );
};

// ── Bloc 1 : Identification de l'entreprise (lecture seule) ──────────────────
const BlocIdentification = ({ raData, isAr }) => {
  const typeLabel = {
    PH: isAr ? 'شخص طبيعي'  : 'Personne physique',
    PM: isAr ? 'شخص معنوي'  : 'Personne morale',
    SC: isAr ? 'فرع'         : 'Succursale',
  }[raData.type_entite] || raData.type_entite;

  const typeColor = { PH: '#1a4480', PM: '#7b5ea7', SC: '#0d7a5f' }[raData.type_entite] || '#555';
  const typeBg    = { PH: '#e8f0fe', PM: '#f3ecff', SC: '#e6f7f1' }[raData.type_entite] || '#f5f5f5';

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderLeft: '4px solid #1a4480' }}
      title={
        <Space>
          <InfoCircleOutlined style={{ color: '#1a4480' }} />
          <span style={{ color: '#1a4480', fontWeight: 600 }}>
            {isAr ? 'البيانات التعريفية للمنشأة' : 'Identification de l\'entreprise'}
          </span>
        </Space>
      }
    >
      <Descriptions size="small" column={3} bordered>
        <Descriptions.Item label={isAr ? 'الرقم التحليلي' : 'N° Analytique'}>
          <strong style={{ color: '#1a4480' }}>{raData.numero_ra}</strong>
        </Descriptions.Item>
        <Descriptions.Item label={isAr ? 'رقم السجل التجاري' : 'N° RC'}>
          {raData.numero_rc || <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label={isAr ? 'نوع المنشأة' : 'Type d\'entreprise'}>
          <Tag style={{ color: typeColor, background: typeBg, border: `1px solid ${typeColor}33`, fontWeight: 500 }}>
            {typeLabel}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={isAr ? 'التسمية / الاسم التجاري' : 'Dénomination / Raison sociale'} span={2}>
          <strong>{raData.denomination}</strong>
        </Descriptions.Item>
        <Descriptions.Item label={isAr ? 'تاريخ التسجيل' : 'Date d\'immatriculation'}>
          {raData.date_immatriculation || <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label={isAr ? 'الوضع' : 'Statut'}>
          <Tag color={STATUT_COLOR[raData.statut] || 'default'}>{raData.statut}</Tag>
        </Descriptions.Item>
        {raData.localite && (
          <Descriptions.Item label={isAr ? 'المحكمة / المنطقة' : 'Localité'} span={2}>
            {raData.localite}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
};

// ── Bloc 2 : Données actuelles (lecture seule) ────────────────────────────────
const BlocDonneesActuelles = ({ raData, isAr, formesJuridiques }) => {
  const ent  = raData.entity || {};
  const type = raData.type_entite;

  const fj = formesJuridiques.find(f => f.id === ent.forme_juridique_id);
  const fjLabel = ent.forme_juridique || (fj ? (isAr ? fj.libelle_ar || fj.libelle_fr : `${fj.code} – ${fj.libelle_fr}`) : '');

  const rows = [];
  const addRow = (label, val, span = 1) => { if (val) rows.push({ label, val, span }); };

  if (type === 'PM') {
    // Mode AR → champs arabes, mode FR → champs français
    addRow(isAr ? 'التسمية'            : 'Dénomination',
           isAr ? (ent.denomination_ar || ent.denomination) : ent.denomination);
    addRow(isAr ? 'الاختصار'           : 'Sigle',                  ent.sigle);
    addRow(isAr ? 'الشكل القانوني'     : 'Forme juridique',        fjLabel);
    addRow(isAr ? 'رأس المال'          : 'Capital social',
           ent.capital_social ? `${ent.capital_social} ${ent.devise_capital || ''}` : '');
    addRow(isAr ? 'مدة الشركة'         : 'Durée de la société',    ent.duree_societe ? `${ent.duree_societe} ans` : '');
    addRow(isAr ? 'المقر الاجتماعي'    : 'Siège social',           ent.siege_social, 2);
    addRow(isAr ? 'المدينة'            : 'Ville',                  ent.ville);
    addRow(isAr ? 'الهاتف'             : 'Téléphone',              ent.telephone);
    addRow('Fax',                                                    ent.fax);
    addRow(isAr ? 'البريد الإلكتروني' : 'E-mail',                 ent.email);
    addRow(isAr ? 'الموقع الإلكتروني' : 'Site web',               ent.site_web);
    addRow('B.P.',                                                   ent.bp);
    // N° RC en lecture seule pour information (non modifiable)
    if (raData.numero_rc) addRow(isAr ? 'رقم السجل التجاري' : 'N° RC (non modifiable)', raData.numero_rc);
  } else if (type === 'PH') {
    // Identité civile — affichée en lecture seule, non modifiable
    if (isAr) {
      addRow('اللقب (AR)',   ent.nom_ar   || ent.nom);
      addRow('الاسم (AR)',   ent.prenom_ar || ent.prenom);
      addRow('العنوان',      ent.adresse_ar || ent.adresse, 2);
    } else {
      addRow('Nom',          ent.nom);
      addRow('Prénom',       ent.prenom);
      addRow('Adresse professionnelle / Domicile', ent.adresse, 2);
    }
    addRow(isAr ? 'المدينة'            : 'Ville',                  ent.ville);
    addRow(isAr ? 'الهاتف'             : 'Téléphone',              ent.telephone);
    addRow(isAr ? 'البريد الإلكتروني' : 'E-mail',                 ent.email);
    addRow(isAr ? 'المهنة / النشاط المُمارَس' : 'Profession / Activité exercée', ent.profession);
    // Nom commercial et gérant actuel
    addRow(isAr ? 'الاسم التجاري' : 'Nom commercial', ent.denomination_commerciale);
    addRow(isAr ? 'المسير الحالي' : 'Gérant actuel',  ent.gerant_actif);
  } else if (type === 'SC') {
    addRow(isAr ? 'التسمية'            : 'Dénomination',
           isAr ? (ent.denomination_ar || ent.denomination) : ent.denomination);
    addRow(isAr ? 'المقر الاجتماعي'    : 'Siège social',           ent.siege_social, 2);
    addRow(isAr ? 'المدينة'            : 'Ville',                  ent.ville);
    addRow(isAr ? 'الهاتف'             : 'Téléphone',              ent.telephone);
    addRow(isAr ? 'البريد الإلكتروني' : 'E-mail',                 ent.email);
    addRow(isAr ? 'النشاط / موضوع الفرع' : 'Activité de la succursale', ent.activite);
    addRow(isAr ? 'المدير الحالي'     : 'Directeur actuel',       ent.directeur_actif);
    if (raData.numero_rc) addRow(isAr ? 'رقم السجل التجاري' : 'N° RC (pour info)', raData.numero_rc);
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderLeft: '4px solid #8c8c8c' }}
      title={
        <Space>
          <FileTextOutlined style={{ color: '#595959' }} />
          <span style={{ color: '#595959', fontWeight: 600 }}>
            {isAr ? 'البيانات الحالية (للاطلاع فقط)' : 'Données actuelles — État avant modification'}
          </span>
          <Tag color="default">{isAr ? 'قراءة فقط' : 'Lecture seule'}</Tag>
        </Space>
      }
    >
      {rows.length === 0 ? (
        <Text type="secondary">{isAr ? 'لا توجد بيانات.' : 'Aucune donnée disponible.'}</Text>
      ) : (
        <Descriptions size="small" column={2} bordered>
          {rows.map((r, i) => (
            <Descriptions.Item key={i} label={r.label} span={r.span}>
              <span style={{ color: '#555' }}>{r.val}</span>
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </Card>
  );
};

// ── Composant principal ────────────────────────────────────────────────────────
const FormulaireModification = () => {
  const { id }         = useParams();
  const location       = useLocation();
  const isCorrection   = location.pathname.endsWith('/corriger');
  const isEdit         = Boolean(id) && !isCorrection;
  const navigate       = useNavigate();
  const queryClient    = useQueryClient();
  const [form]         = Form.useForm();
  const { t, isAr }   = useLanguage();

  const [raDataManual,  setRaDataManual]  = useState(null);
  const [lookupVal,     setLookupVal]     = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState('');
  const [pendingFiles,  setPendingFiles]  = useState([]);

  // ── Organes PM — état événementiel ────────────────────────────────────────
  // evenementsOrganes : { gerants: {[id]: {sort,date_effet,ref_decision,remplacant}}, ... }
  // nouvellesNominations : { gerants: [...rows], administrateurs: [...], dirigeants: [...], commissaires: [...] }
  const [evenementsOrganes, setEvenementsOrganes] = useState({
    gerants: {}, administrateurs: {}, dirigeants: {}, commissaires: {},
  });
  const [nouvellesNominations, setNouvellesNominations] = useState({
    gerants: [], administrateurs: [], dirigeants: [], commissaires: [],
  });

  // ── Chargement modification existante ─────────────────────────────────────
  const { data: existing } = useQuery({
    queryKey: ['modification', id],
    queryFn:  () => modifAPI.get(id).then(r => r.data),
    enabled:  isEdit || isCorrection,
  });

  // ── Données RA (mode édition) ─────────────────────────────────────────────
  const { data: raDataEdit, isLoading: raEditLoading } = useQuery({
    queryKey: ['modif-ra-data', id],
    queryFn:  () => modifAPI.raData(id).then(r => r.data),
    enabled:  (isEdit || isCorrection) && Boolean(id),
  });

  // ── Formes juridiques ──────────────────────────────────────────────────────
  const { data: formesJuridiques = [] } = useQuery({
    queryKey: ['formes-juridiques'],
    queryFn:  () => parametrageAPI.formesJuridiques().then(r => r.data?.results || r.data || []),
  });

  // ── Nationalités (pour bloc identité directeur SC) ─────────────────────────
  const { data: nationalites = [] } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites({ page_size: 500 }).then(r => r.data?.results || r.data || []),
  });

  // ── Pré-remplissage en mode édition/correction ────────────────────────────
  // On remplit UNIQUEMENT avec les nouvelles_donnees précédemment saisies,
  // jamais avec les données actuelles (celles-ci sont affichées en lecture seule).
  useEffect(() => {
    if ((isEdit || isCorrection) && existing) {
      const e    = existing.nouvelles_donnees?.entity || {};
      const ra   = existing.nouvelles_donnees?.ra     || {};
      const meta = existing.nouvelles_donnees?.meta   || {};

      form.setFieldsValue({
        denomination:       e.denomination       || undefined,
        denomination_ar:    e.denomination_ar    || undefined,
        sigle:              e.sigle              || undefined,
        forme_juridique_id: e.forme_juridique_id || undefined,
        capital_social:     e.capital_social     ? parseFloat(e.capital_social) : undefined,
        devise_capital:     e.devise_capital     || 'MRU',
        duree_societe:      e.duree_societe      ? Number(e.duree_societe) : undefined,
        siege_social:       e.siege_social       || undefined,
        objet_social:       e.objet_social       || undefined,
        ville:              e.ville              || undefined,
        telephone:          e.telephone          || undefined,
        fax:                e.fax                || undefined,
        email:              e.email              || undefined,
        site_web:           e.site_web           || undefined,
        bp:                 e.bp                 || undefined,
        adresse:            e.adresse            || undefined,
        adresse_ar:         e.adresse_ar         || undefined,
        profession:         e.profession         || undefined,
        numero_rc:          ra.numero_rc         || undefined,
        localite_id:        ra.localite_id       || undefined,
        activite:           e.activite           || undefined,
        nom_commercial:     e.denomination_commerciale || undefined,
        gerant_option:      meta.nouveau_gerant_nom ? 'nouveau' : 'inchange',
        nouveau_gerant_nom: meta.nouveau_gerant_nom || undefined,
        directeur_option:      (meta.nouveau_directeur || meta.nouveau_directeur_nom) ? 'nouveau' : 'inchange',
        dir_nom:               meta.nouveau_directeur?.nom          || undefined,
        dir_prenom:            meta.nouveau_directeur?.prenom       || undefined,
        dir_nom_ar:            meta.nouveau_directeur?.nom_ar       || undefined,
        dir_prenom_ar:         meta.nouveau_directeur?.prenom_ar    || undefined,
        dir_nationalite_id:    meta.nouveau_directeur?.nationalite_id || undefined,
        dir_date_naissance:    meta.nouveau_directeur?.date_naissance || undefined,
        dir_lieu_naissance:    meta.nouveau_directeur?.lieu_naissance || undefined,
        dir_nni:               meta.nouveau_directeur?.nni          || undefined,
        dir_adresse:           meta.nouveau_directeur?.adresse      || undefined,
        dir_telephone:         meta.nouveau_directeur?.telephone    || undefined,
        demandeur:    meta.demandeur    || undefined,
        motif:        meta.motif        || existing.observations || undefined,
        date_effet:   meta.date_effet   || undefined,
        observations: meta.observations || undefined,
      });

      // ── Pré-remplissage organes PM (nouveau format événementiel) ──────────
      const _toRows = (arr) => (arr || []).map((o, i) => ({ ...o, _key: Date.now() + i }));
      const _listToDict = (list) => {
        const d = {};
        (list || []).forEach(ev => { if (ev.id) d[ev.id] = ev; });
        return d;
      };
      if (meta.evenements_organes || meta.nouvelles_nominations) {
        const savedEv  = meta.evenements_organes  || {};
        const savedNom = meta.nouvelles_nominations || {};
        setEvenementsOrganes({
          gerants:        _listToDict(savedEv.gerants),
          administrateurs: _listToDict(savedEv.administrateurs),
          dirigeants:     _listToDict(savedEv.dirigeants),
          commissaires:   _listToDict(savedEv.commissaires),
        });
        setNouvellesNominations({
          gerants:        _toRows(savedNom.gerants),
          administrateurs: _toRows(savedNom.administrateurs),
          dirigeants:     _toRows(savedNom.dirigeants),
          commissaires:   _toRows(savedNom.commissaires),
        });
      }
    }
  }, [raDataEdit, existing]); // eslint-disable-line

  // ── raData actif ──────────────────────────────────────────────────────────
  const raData = isEdit || isCorrection ? raDataEdit : raDataManual;

  // ── Initialisation des événements organes depuis raData ───────────────────
  // Dès que raData est disponible (lookup ou chargement édit), on initialise
  // toutes les lignes existantes à MAINTENU.  Ne s'exécute pas si on restaure
  // depuis un brouillon (useEffect ci-dessus a déjà tout rempli).
  useEffect(() => {
    if (!raData) return;
    const _est_sa = raData.est_sa === true;
    const _mkEv = () => ({ sort: 'MAINTENU', date_effet: '', ref_decision: '', remplacant: null });
    const _toDict = (list) => {
      const d = {};
      (list || []).forEach(org => { if (org.id) d[org.id] = _mkEv(); });
      return d;
    };
    if (!_est_sa) {
      setEvenementsOrganes({
        gerants: _toDict(raData.gerants_actifs),
        administrateurs: {}, dirigeants: {}, commissaires: {},
      });
    } else {
      setEvenementsOrganes({
        gerants: {},
        administrateurs: _toDict(raData.administrateurs_actifs),
        dirigeants:      _toDict(raData.dirigeants_actifs),
        commissaires:    _toDict(raData.commissaires_actifs),
      });
    }
    setNouvellesNominations({ gerants: [], administrateurs: [], dirigeants: [], commissaires: [] });
  }, [raData?.id]); // eslint-disable-line

  // ── Lookup manuel (création uniquement) ───────────────────────────────────
  const handleLookup = async () => {
    const v = lookupVal.trim();
    if (!v) { setLookupError(isAr ? 'أدخل رقم القيد التحليلي.' : 'Saisissez un N° analytique.'); return; }
    setLookupLoading(true);
    setLookupError('');
    try {
      const r = await modifAPI.lookup({ numero_ra: v });
      setRaDataManual(r.data);
      // En création : on ne pré-remplit PAS le formulaire avec les données actuelles.
      // L'agent saisit uniquement les champs qu'il souhaite modifier.
      form.resetFields();
      form.setFieldsValue({ devise_capital: r.data.entity?.devise_capital || 'MRU' });
    } catch (err) {
      setLookupError(err.response?.data?.detail || (isAr ? 'الملف غير موجود.' : 'Dossier introuvable.'));
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Construction du payload ────────────────────────────────────────────────
  const _buildPayload = (values) => {
    if (!raData) return null;

    const entityFields = raData.type_entite === 'PM'
      ? ['denomination','denomination_ar','sigle','forme_juridique_id','capital_social',
         'devise_capital','duree_societe','siege_social','objet_social','ville','telephone','fax','email','site_web','bp']
      : raData.type_entite === 'PH'
      // Identité civile (nom/prenom) EXCLUE — modification interdite par la loi RCCM.
      // adresse ou adresse_ar selon la langue active.
      ? ['adresse','adresse_ar','ville','telephone','email','profession']
      // SC : objet_social absent (remplacé par activite) ; capital_affecte exclu
      : ['denomination','denomination_ar','siege_social','activite','ville','telephone','email'];

    const entity = {};
    entityFields.forEach(f => { if (values[f] !== undefined && values[f] !== '') entity[f] = values[f]; });

    // N° RC exclu du payload pour tous (non modifiable via inscription modificative)
    const raPatch = {};
    if (values.localite_id) raPatch.localite_id = values.localite_id;

    // PH : nom_commercial → entity.denomination (unifié) ; gérant → meta (traitement spécial)
    const metaPH = {};
    if (raData.type_entite === 'PH') {
      if (values.nom_commercial)                               entity['denomination']     = values.nom_commercial;
      if (values.gerant_option === 'nouveau' && values.nouveau_gerant_nom)
                                                               metaPH.nouveau_gerant_nom = values.nouveau_gerant_nom;
    }

    // SC : directeur → meta (bloc identité complet)
    const metaSC = {};
    if (raData.type_entite === 'SC' && values.directeur_option === 'nouveau') {
      const dir = {};
      if (values.dir_nom)           dir.nom           = values.dir_nom;
      if (values.dir_prenom)        dir.prenom        = values.dir_prenom;
      if (values.dir_nom_ar)        dir.nom_ar        = values.dir_nom_ar;
      if (values.dir_prenom_ar)     dir.prenom_ar     = values.dir_prenom_ar;
      if (values.dir_nationalite_id) dir.nationalite_id = values.dir_nationalite_id;
      if (values.dir_date_naissance) dir.date_naissance = values.dir_date_naissance;
      if (values.dir_lieu_naissance) dir.lieu_naissance = values.dir_lieu_naissance;
      if (values.dir_nni)           dir.nni           = values.dir_nni;
      if (values.dir_adresse)       dir.adresse       = values.dir_adresse;
      if (values.dir_telephone)     dir.telephone     = values.dir_telephone;
      if (Object.keys(dir).length > 0) metaSC.nouveau_directeur = dir;
    }

    // PM : organes — nouveau format événementiel
    const metaOrganes = {};
    if (raData.type_entite === 'PM') {
      const _est_sa    = raData.est_sa === true;
      const _stripKey  = (o) => { const { _key, ...rest } = o; return rest; }; // eslint-disable-line
      // Convertit le dict {[id]: ev} + la liste d'organes actifs en liste payload backend
      const _toEvList  = (evMap, organes) =>
        (organes || []).map(org => {
          const ev   = evMap[org.id] || { sort: 'MAINTENU' };
          const item = { id: org.id, sort: ev.sort };
          if (ev.sort !== 'MAINTENU') {
            item.date_effet    = ev.date_effet    || '';
            item.ref_decision  = ev.ref_decision  || '';
            if (ev.remplacant && Object.keys(ev.remplacant).length > 0) {
              item.remplacant = ev.remplacant;
            }
          }
          return item;
        });
      const ev_org    = {};
      const nominations = {};
      if (!_est_sa) {
        const evList = _toEvList(evenementsOrganes.gerants, raData.gerants_actifs);
        if (evList.some(e => e.sort !== 'MAINTENU')) ev_org.gerants = evList;
        if (nouvellesNominations.gerants?.length > 0)
          nominations.gerants = nouvellesNominations.gerants.map(_stripKey);
      } else {
        const evAdm = _toEvList(evenementsOrganes.administrateurs, raData.administrateurs_actifs);
        const evDir = _toEvList(evenementsOrganes.dirigeants,      raData.dirigeants_actifs);
        const evCom = _toEvList(evenementsOrganes.commissaires,    raData.commissaires_actifs);
        if (evAdm.some(e => e.sort !== 'MAINTENU')) ev_org.administrateurs = evAdm;
        if (evDir.some(e => e.sort !== 'MAINTENU')) ev_org.dirigeants      = evDir;
        if (evCom.some(e => e.sort !== 'MAINTENU')) ev_org.commissaires    = evCom;
        if (nouvellesNominations.administrateurs?.length > 0)
          nominations.administrateurs = nouvellesNominations.administrateurs.map(_stripKey);
        if (nouvellesNominations.dirigeants?.length > 0)
          nominations.dirigeants = nouvellesNominations.dirigeants.map(_stripKey);
        if (nouvellesNominations.commissaires?.length > 0)
          nominations.commissaires = nouvellesNominations.commissaires.map(_stripKey);
      }
      if (Object.keys(ev_org).length    > 0) metaOrganes.evenements_organes  = ev_org;
      if (Object.keys(nominations).length > 0) metaOrganes.nouvelles_nominations = nominations;
    }

    const nouvelles_donnees = {
      entity,
      ra: raPatch,
      meta: {
        demandeur:    values.demandeur    || '',
        motif:        values.motif        || '',
        date_effet:   values.date_effet   || '',
        observations: values.observations || '',
        ...metaPH,
        ...metaSC,
        ...metaOrganes,
      },
    };

    // observations = motif (pour le workflow : affiché dans les alertes de retour)
    const observations = values.motif || values.observations || '';

    const demandeur = (values.demandeur || '').trim();
    return isCorrection
      ? { nouvelles_donnees, observations, demandeur }
      : { ra: raData.id, nouvelles_donnees, observations, demandeur,
          // ── Langue de l'acte : déterminée à la création par la langue de l'interface ──
          langue_acte: isAr ? 'ar' : 'fr' };
  };

  // ── Mutation principale ────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async ({ payload, andSubmit }) => {
      let res;
      if (isCorrection) {
        res = await modifAPI.modifierCorrectif(id, payload);
      } else {
        res = await (isEdit ? modifAPI.update(id, payload) : modifAPI.create(payload));
      }
      const modifId = res.data.id;
      for (const pf of pendingFiles) {
        try {
          const fd = new FormData();
          fd.append('fichier',      pf.file);
          fd.append('nom_fichier',  pf.name);
          fd.append('modification', modifId);
          await documentAPI.upload(fd);
        } catch {
          message.warning(`Impossible d'uploader ${pf.name}.`);
        }
      }
      if (andSubmit) await modifAPI.soumettre(modifId);
      return { res, andSubmit };
    },
    onSuccess: ({ res, andSubmit }) => {
      queryClient.invalidateQueries({ queryKey: ['modifications'] });
      queryClient.invalidateQueries({ queryKey: ['modification', id] });
      if (andSubmit) {
        message.success(isAr ? 'تم الحفظ والإرسال إلى المسجل.' : 'Dossier enregistré et soumis au greffier.');
        navigate('/modifications');
      } else {
        message.success(
          isCorrection ? (isAr ? 'تم التصحيح.' : 'Correction appliquée.')
          : isEdit     ? (isAr ? 'تم الحفظ.' : 'Modification mise à jour.')
          :              (isAr ? 'تم الحفظ كمسودة.' : 'Enregistré en brouillon.')
        );
        navigate(`/modifications/${res.data.id}`);
      }
    },
    onError: (e) => message.error(e.response?.data?.detail || (isAr ? 'خطأ في الحفظ.' : 'Erreur lors de l\'enregistrement.')),
  });

  const onSave = (values) => {
    if (!raData) { message.warning(isAr ? 'الملف غير محمل.' : 'Recherchez d\'abord un dossier.'); return; }
    const payload = _buildPayload(values);
    if (payload) saveMut.mutate({ payload, andSubmit: false });
  };

  const onSaveAndSubmit = () => {
    form.validateFields().then(values => {
      if (!raData) { message.warning(isAr ? 'الملف غير محمل.' : 'Recherchez d\'abord un dossier.'); return; }
      const payload = _buildPayload(values);
      if (payload) saveMut.mutate({ payload, andSubmit: true });
    });
  };

  // ── Helpers organes ───────────────────────────────────────────────────────
  const _updateEv = (type, id, patch) => setEvenementsOrganes(prev => ({
    ...prev,
    [type]: {
      ...prev[type],
      [id]: { sort: 'MAINTENU', date_effet: '', ref_decision: '', remplacant: null, ...(prev[type]?.[id] || {}), ...patch },
    },
  }));
  const _setNominations = (type) => (updateFn) => setNouvellesNominations(prev => ({
    ...prev,
    [type]: typeof updateFn === 'function' ? updateFn(prev[type]) : updateFn,
  }));

  const isPM     = raData?.type_entite === 'PM' || raData?.type_entite === 'SC';
  const isPH     = raData?.type_entite === 'PH';
  const isSC     = raData?.type_entite === 'SC';
  const isPMOnly = raData?.type_entite === 'PM'; // PM stricto sensu (pas SC)
  const estSA    = raData?.est_sa === true;
  const isRectif = existing?.est_rectification_greffier;

  const titre = isAr
    ? (isRectif ? 'تصحيح مطلوب من المسجل' : isEdit ? 'تعديل الطلب' : 'طلب قيد تعديلي جديد')
    : (isRectif ? 'Rectification demandée par le greffier' : isEdit ? 'Modifier la demande' : 'Nouvelle inscription modificative');

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>

      {/* ── En-tête ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />}
          onClick={() => navigate(id ? `/modifications/${id}` : '/modifications')} />
        <div>
          <Title level={4} style={{ margin: 0 }}>{titre}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isAr
              ? 'أدخل فقط البيانات التي تريد تعديلها — البيانات الفارغة لن تُعدَّل'
              : 'Renseignez uniquement les champs à modifier — les champs vides ne seront pas modifiés'}
          </Text>
        </div>
      </div>

      {/* ── Alerte rectification greffier ─────────────────────────────────── */}
      {isRectif && existing?.statut === 'RETOURNE' && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={isAr ? 'تصحيح مطلوب من المسجل' : 'Rectification demandée par le greffier'}
          description={existing.observations}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ÉTAPE 1 — Recherche (création uniquement)
      ═══════════════════════════════════════════════════════════════════ */}
      {!isEdit && !isCorrection && (
        <Card
          size="small"
          style={{ marginBottom: 16, borderLeft: '4px solid #faad14' }}
          title={
            <Space>
              <span style={{ background: '#faad14', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>1</span>
              <span style={{ fontWeight: 600 }}>
                {isAr ? 'البحث عن الملف المراد تعديله' : 'Étape 1 — Recherche du dossier à modifier'}
              </span>
            </Space>
          }
        >
          <Row gutter={8} align="middle">
            <Col flex="auto">
              <Input
                size="middle"
                placeholder={isAr ? 'رقم القيد التحليلي (مثال: 000013)' : 'N° analytique (ex : 000013)'}
                value={lookupVal}
                onChange={e => setLookupVal(e.target.value)}
                onPressEnter={handleLookup}
                prefix={<InfoCircleOutlined style={{ color: '#aaa' }} />}
              />
            </Col>
            <Col>
              <Button type="primary" onClick={handleLookup} loading={lookupLoading}
                style={{ background: '#1a4480' }}>
                {isAr ? 'بحث' : 'Rechercher'}
              </Button>
            </Col>
          </Row>
          {lookupError && (
            <Alert type="error" message={lookupError} style={{ marginTop: 8 }} showIcon />
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCS 1–5 — Apparaissent dès que raData est disponible
      ═══════════════════════════════════════════════════════════════════ */}
      {raData && (
        <Spin spinning={(isEdit || isCorrection) ? raEditLoading : false}>

          {/* ─── BLOC 1 : Identification ──────────────────────────────────── */}
          <BlocIdentification raData={raData} isAr={isAr} />

          {/* ─── BLOC 2 : Données actuelles ──────────────────────────────── */}
          <BlocDonneesActuelles
            raData={raData}
            isAr={isAr}
            formesJuridiques={formesJuridiques}
          />

          <Form form={form} layout="vertical" onFinish={onSave}>

            {/* ─── BLOC 3 : Données proposées ───────────────────────────── */}
            <Card
              size="small"
              style={{ marginBottom: 16, borderLeft: '4px solid #2e7d32' }}
              title={
                <Space>
                  <EditOutlined style={{ color: '#2e7d32' }} />
                  <span style={{ color: '#2e7d32', fontWeight: 600 }}>
                    {isAr ? 'البيانات الجديدة المقترحة' : 'Données proposées — Nouvelles valeurs'}
                  </span>
                </Space>
              }
              extra={
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {isAr
                    ? 'اترك الحقل فارغاً إذا لم تُرِد تعديله'
                    : 'Laissez vide si le champ ne doit pas être modifié'}
                </Text>
              }
            >
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={isAr
                  ? 'حقول الشركاء/المساهمين لا يمكن تعديلها هنا. استخدم طلب تنازل عن حصص.'
                  : 'Les associés / actionnaires ne sont pas modifiables ici. Utilisez une cession de parts.'
                }
              />

              {/* ── PM / SC ──────────────────────────────────────────────── */}
              {isPM && (
                <>
                  <Row gutter={16}>
                    <Col span={isAr ? 12 : 24}>
                      <Form.Item
                        label={isAr ? 'التسمية (FR)' : 'Dénomination'}
                        name="denomination"
                        rules={[uppercaseRule(isAr)]}
                      >
                        <Input placeholder={raData.entity?.denomination || (isAr ? 'اتركه فارغاً إذا لم يتغير' : 'Laisser vide si inchangé')} />
                      </Form.Item>
                    </Col>
                    {isAr && (
                      <Col span={12}>
                        <Form.Item label="التسمية (AR)" name="denomination_ar">
                          <Input dir="rtl" placeholder={raData.entity?.denomination_ar || ''} />
                        </Form.Item>
                      </Col>
                    )}
                  </Row>

                  {!isSC && (
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item label={isAr ? 'الاختصار' : 'Sigle'} name="sigle">
                          <Input placeholder={raData.entity?.sigle || ''} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label={isAr ? 'الشكل القانوني' : 'Forme juridique'} name="forme_juridique_id">
                          <Select
                            options={formesJuridiques.map(f => ({
                              value: f.id,
                              label: isAr ? (f.libelle_ar || f.libelle_fr) : `${f.code} – ${f.libelle_fr}`,
                            }))}
                            placeholder={isAr ? 'اترك فارغاً إذا لم يتغير' : 'Laisser vide si inchangé'}
                            allowClear
                          />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item label={isAr ? 'رأس المال' : 'Capital social'} style={{ marginBottom: 0 }}>
                          <Input.Group compact>
                            <Form.Item name="capital_social" noStyle>
                              <InputNumber
                                min={0}
                                style={{ width: '65%' }}
                                placeholder={raData.entity?.capital_social || '0'}
                              />
                            </Form.Item>
                            <Form.Item name="devise_capital" noStyle initialValue="MRU">
                              <DeviseSelect style={{ width: '35%' }} />
                            </Form.Item>
                          </Input.Group>
                        </Form.Item>
                      </Col>
                    </Row>
                  )}

                  {/* Objet social — PM uniquement (SC utilise le champ Activité ci-dessous) */}
                  {!isSC && (
                    <Row gutter={16}>
                      <Col span={24}>
                        <Form.Item
                          label={isAr ? 'الغرض الاجتماعي (موضوع الشركة)' : 'Objet social'}
                          name="objet_social"
                          help={isAr
                            ? 'وصف نشاط وغرض الشركة كما يُدرج في السجل التجاري'
                            : 'Description de l\'activité et de l\'objet de la société tel qu\'inscrit au registre'}
                        >
                          <Input.TextArea
                            rows={3}
                            placeholder={raData.entity?.objet_social
                              || (isAr ? 'اتركه فارغاً إذا لم يتغير' : 'Laisser vide si inchangé')}
                            showCount
                            maxLength={1000}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}

                  {/* Activité — SC uniquement, placée en premier (avant siège social) */}
                  {isSC && (
                    <Row gutter={16}>
                      <Col span={24}>
                        <Form.Item
                          label={isAr ? 'النشاط / موضوع الفرع' : 'Activité de la succursale'}
                          name="activite"
                          help={isAr
                            ? 'وصف نشاط الفرع كما يُدرج في السجل التجاري'
                            : 'Description de l\'activité de la succursale telle qu\'inscrite au registre'}
                        >
                          <Input.TextArea
                            rows={3}
                            placeholder={raData.entity?.activite || (isAr ? 'اتركه فارغاً إذا لم يتغير' : 'Laisser vide si inchangé')}
                            showCount
                            maxLength={1000}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label={isAr ? 'المقر الاجتماعي' : 'Siège social'} name="siege_social">
                        <Input.TextArea rows={2} placeholder={raData.entity?.siege_social || ''} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label={isAr ? 'المدينة' : 'Ville'} name="ville">
                        <Input placeholder={raData.entity?.ville || ''} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label={isAr ? 'الهاتف' : 'Téléphone'} name="telephone">
                        <Input placeholder={raData.entity?.telephone || ''} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label={isAr ? 'البريد الإلكتروني' : 'E-mail'} name="email">
                        <Input type="email" placeholder={raData.entity?.email || ''} />
                      </Form.Item>
                    </Col>
                    {!isSC && (
                      <Col span={8}>
                        <Form.Item label="Fax" name="fax">
                          <Input placeholder={raData.entity?.fax || ''} />
                        </Form.Item>
                      </Col>
                    )}
                  </Row>

                  {!isSC && (
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item label={isAr ? 'الموقع الإلكتروني' : 'Site web'} name="site_web">
                          <Input placeholder={raData.entity?.site_web || ''} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="B.P." name="bp">
                          <Input placeholder={raData.entity?.bp || ''} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label={isAr ? 'المدة (سنوات)' : 'Durée (ans)'} name="duree_societe">
                          <InputNumber
                            style={{ width: '100%' }}
                            min={1}
                            placeholder={raData.entity?.duree_societe || ''}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}

                  {/* ── PM non-SC : organes sociaux — gestion événementielle ── */}
                  {isPMOnly && (
                    <>
                      <Divider style={{ margin: '8px 0 12px' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {isAr ? 'الأجهزة الاجتماعية' : 'Organes sociaux'}
                        </Text>
                      </Divider>

                      <Alert
                        type="info" showIcon style={{ marginBottom: 12 }}
                        message={isAr
                          ? 'حدِّد مصير كل عضو : إبقاء، استقالة، إقالة، أو انتهاء المهمة. لكل خروج، أدخل تاريخ السريان ومرجع القرار.'
                          : 'Déclarez le sort de chaque organe : maintenu, démission, révocation ou fin de mandat. Pour toute sortie, renseignez la date d\'effet et la référence de la délibération.'}
                      />

                      {!estSA ? (
                        /* ── Non-SA : événements gérants ─────────────────────── */
                        <>
                          {/* Organes existants — sort */}
                          <OrganeTableMod
                            title={isAr ? 'المسير(ون) الحاليون' : 'Gérant(s) actuel(s)'}
                            icon="👔"
                            organes={raData.gerants_actifs || []}
                            events={evenementsOrganes.gerants}
                            onUpdateEvent={(id, patch) => _updateEv('gerants', id, patch)}
                            nationalites={nationalites}
                            FormFields={GerantPMFormFields}
                          />

                          {/* Nouvelles nominations — sans toucher aux existants */}
                          <TableEditable
                            title={isAr ? '➕ تعيينات جديدة — مسيرون' : '➕ Nouvelles nominations — Gérant(s)'}
                            rows={nouvellesNominations.gerants}
                            setRows={_setNominations('gerants')}
                            columns={[
                              { title: isAr ? 'الاسم' : 'Nom', key: 'n', render: (_, r) => [r.prenom || r.prenom_ar, r.nom || r.nom_ar].filter(Boolean).join(' ') || '—' },
                              { title: isAr ? 'المنصب' : 'Fonction', dataIndex: 'fonction', render: v => v || '—' },
                            ]}
                            formFields={<GerantPMFormFields nationalites={nationalites} />}
                          />
                        </>
                      ) : (
                        /* ── SA : CA + Dirigeants + Commissaires ─────────────── */
                        <>
                          {/* Conseil d'administration — événements */}
                          <OrganeTableMod
                            title={isAr ? 'مجلس الإدارة الحالي' : 'Conseil d\'administration — membres actuels'}
                            icon="🏛️"
                            organes={raData.administrateurs_actifs || []}
                            events={evenementsOrganes.administrateurs}
                            onUpdateEvent={(id, patch) => _updateEv('administrateurs', id, patch)}
                            nationalites={nationalites}
                            FormFields={AdminFormFieldsMod}
                          />
                          <TableEditable
                            title={isAr ? '➕ تعيينات جديدة — مجلس الإدارة' : '➕ Nouvelles nominations — Administrateurs'}
                            rows={nouvellesNominations.administrateurs}
                            setRows={_setNominations('administrateurs')}
                            columns={[
                              { title: isAr ? 'الاسم' : 'Nom', key: 'n', render: (_, r) => [r.prenom || r.prenom_ar, r.nom || r.nom_ar].filter(Boolean).join(' ') || '—' },
                              { title: isAr ? 'المهمة' : 'Fonction', dataIndex: 'fonction', render: v => v || '—' },
                            ]}
                            formFields={<AdminFormFieldsMod nationalites={nationalites} />}
                          />

                          {/* Dirigeants SA — événements */}
                          <OrganeTableMod
                            title={isAr ? 'المديرون التنفيذيون الحاليون (DG/PDG)' : 'Dirigeant(s) actuels — DG / PDG'}
                            icon="👤"
                            organes={raData.dirigeants_actifs || []}
                            events={evenementsOrganes.dirigeants}
                            onUpdateEvent={(id, patch) => _updateEv('dirigeants', id, patch)}
                            nationalites={nationalites}
                            FormFields={DirigentFormFieldsMod}
                          />
                          <TableEditable
                            title={isAr ? '➕ تعيينات جديدة — مديرون تنفيذيون' : '➕ Nouvelles nominations — Dirigeants'}
                            rows={nouvellesNominations.dirigeants}
                            setRows={_setNominations('dirigeants')}
                            columns={[
                              { title: isAr ? 'الاسم' : 'Nom', key: 'n', render: (_, r) => [r.prenom || r.prenom_ar, r.nom || r.nom_ar].filter(Boolean).join(' ') || '—' },
                              { title: isAr ? 'المنصب' : 'Fonction', dataIndex: 'fonction', render: v => v || '—' },
                            ]}
                            formFields={<DirigentFormFieldsMod nationalites={nationalites} />}
                          />

                          {/* Commissaires — événements */}
                          <OrganeTableMod
                            title={isAr ? 'مراقبو الحسابات الحاليون' : 'Commissaire(s) aux comptes — actuels'}
                            icon="🔍"
                            organes={raData.commissaires_actifs || []}
                            events={evenementsOrganes.commissaires}
                            onUpdateEvent={(id, patch) => _updateEv('commissaires', id, patch)}
                            nationalites={nationalites}
                            FormFields={CommissaireFormFieldsMod}
                          />
                          <TableEditable
                            title={isAr ? '➕ تعيين مراقب حسابات جديد' : '➕ Nouvelles nominations — Commissaires aux comptes'}
                            rows={nouvellesNominations.commissaires}
                            setRows={_setNominations('commissaires')}
                            columns={[
                              { title: isAr ? 'الاسم' : 'Nom', key: 'n', render: (_, r) => [r.prenom || r.prenom_ar, r.nom || r.nom_ar].filter(Boolean).join(' ') || '—' },
                              { title: isAr ? 'النوع' : 'Type', dataIndex: 'type_commissaire', render: v => v || '—' },
                              { title: isAr ? 'الدور' : 'Rôle', dataIndex: 'role', render: v => v || '—' },
                            ]}
                            formFields={<CommissaireFormFieldsMod nationalites={nationalites} />}
                          />
                        </>
                      )}
                    </>
                  )}

                  {isSC && (
                    <>
                      {/* Directeur de la succursale */}
                      <Divider style={{ margin: '8px 0 12px' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {isAr ? 'المدير' : 'Directeur'}
                        </Text>
                      </Divider>
                      {raData.entity?.directeur_actif && (
                        <Alert
                          type="info"
                          showIcon
                          style={{ marginBottom: 12 }}
                          message={
                            isAr
                              ? `المدير الحالي : ${raData.entity.directeur_actif}`
                              : `Directeur actuel : ${raData.entity.directeur_actif}`
                          }
                        />
                      )}
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            label={isAr ? 'تعديل المدير' : 'Modification du directeur'}
                            name="directeur_option"
                            initialValue="inchange"
                          >
                            <Select>
                              <Option value="inchange">{isAr ? 'المدير غير متغير' : 'Directeur inchangé'}</Option>
                              <Option value="nouveau">{isAr ? 'تعيين مدير جديد' : 'Nouveau directeur'}</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.directeur_option !== cur.directeur_option}>
                        {({ getFieldValue }) => getFieldValue('directeur_option') === 'nouveau' && (
                          <div style={{ background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 6, padding: '12px 16px', marginBottom: 12 }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>
                              {isAr ? 'هوية المدير الجديد — جميع الحقول المُنجَّمة إلزامية' : 'Identité du nouveau directeur — champs obligatoires marqués *'}
                            </Text>

                            {/* Nom / Prénom */}
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item
                                  label={isAr ? 'اللقب (FR)' : 'Nom'}
                                  name="dir_nom"
                                  rules={[
                                    { required: true, message: isAr ? 'اللقب إلزامي' : 'Le nom est obligatoire' },
                                    uppercaseRule(isAr),
                                  ]}
                                >
                                  <Input placeholder={isAr ? 'اللقب بالفرنسية' : 'NOM'} />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item
                                  label={isAr ? 'الاسم (FR)' : 'Prénom'}
                                  name="dir_prenom"
                                  rules={[{ required: true, message: isAr ? 'الاسم إلزامي' : 'Le prénom est obligatoire' }]}
                                >
                                  <Input placeholder={isAr ? 'الاسم بالفرنسية' : 'Prénom'} />
                                </Form.Item>
                              </Col>
                            </Row>

                            {/* Nom / Prénom arabe (si mode AR) */}
                            {isAr && (
                              <Row gutter={16}>
                                <Col span={12}>
                                  <Form.Item label="اللقب (AR)" name="dir_nom_ar">
                                    <Input dir="rtl" placeholder="اللقب بالعربية" />
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item label="الاسم (AR)" name="dir_prenom_ar">
                                    <Input dir="rtl" placeholder="الاسم بالعربية" />
                                  </Form.Item>
                                </Col>
                              </Row>
                            )}

                            {/* Nationalité + Date de naissance */}
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item
                                  label={isAr ? 'الجنسية' : 'Nationalité'}
                                  name="dir_nationalite_id"
                                  rules={[{ required: true, message: isAr ? 'الجنسية إلزامية' : 'La nationalité est obligatoire' }]}
                                >
                                  <Select
                                    showSearch
                                    optionFilterProp="label"
                                    placeholder={isAr ? 'اختر الجنسية' : 'Sélectionner'}
                                    options={nationalites.map(n => ({
                                      value: n.id,
                                      label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr,
                                    }))}
                                  />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item
                                  label={isAr ? 'تاريخ الازدياد' : 'Date de naissance'}
                                  name="dir_date_naissance"
                                  rules={[{ required: true, message: isAr ? 'تاريخ الازدياد إلزامي' : 'La date de naissance est obligatoire' }]}
                                >
                                  <Input type="date" style={{ width: '100%' }} />
                                </Form.Item>
                              </Col>
                            </Row>

                            {/* Lieu de naissance + NNI */}
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item
                                  label={isAr ? 'مكان الازدياد' : 'Lieu de naissance'}
                                  name="dir_lieu_naissance"
                                >
                                  <Input placeholder={isAr ? 'المدينة أو البلد' : 'Ville ou pays'} />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item
                                  label={isAr ? 'رقم الهوية الوطنية / جواز السفر' : 'NNI / N° passeport'}
                                  name="dir_nni"
                                  rules={[{ required: true, message: isAr ? 'رقم الهوية إلزامي' : 'Le NNI / passeport est obligatoire' }]}
                                >
                                  <NniInput placeholder={isAr ? 'رقم الهوية الوطنية (10 أرقام)' : 'NNI (10 chiffres) ou N° passeport'} />
                                </Form.Item>
                              </Col>
                            </Row>

                            {/* Adresse + Téléphone */}
                            <Row gutter={16}>
                              <Col span={16}>
                                <Form.Item
                                  label={isAr ? 'العنوان' : 'Adresse'}
                                  name="dir_adresse"
                                >
                                  <Input placeholder={isAr ? 'عنوان المدير الجديد' : 'Adresse du nouveau directeur'} />
                                </Form.Item>
                              </Col>
                              <Col span={8}>
                                <Form.Item
                                  label={isAr ? 'الهاتف' : 'Téléphone'}
                                  name="dir_telephone"
                                >
                                  <Input placeholder="+222 20 00 00 00" />
                                </Form.Item>
                              </Col>
                            </Row>
                          </div>
                        )}
                      </Form.Item>
                    </>
                  )}
                </>
              )}

              {/* ── PH ───────────────────────────────────────────────────── */}
              {isPH && (
                <>
                  {/* Alerte : identité civile non modifiable */}
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={isAr
                      ? 'الهوية المدنية (الاسم واللقب) لا يمكن تعديلها عبر قيد تعديلي — تغيير الشخص يتم عبر تنازل'
                      : 'L\'identité civile (nom et prénom) n\'est pas modifiable via une inscription modificative — un changement de personne est une cession'
                    }
                  />

                  {/* Nom commercial (enseigne) */}
                  <Row gutter={16}>
                    <Col span={24}>
                      <Form.Item
                        label={isAr ? 'الاسم التجاري (العلامة)' : 'Nom commercial (enseigne)'}
                        name="nom_commercial"
                        help={isAr
                          ? 'الاسم الذي تُمارَس تحته النشاط — يختلف عن الهوية المدنية'
                          : 'Nom sous lequel l\'activité est exercée — distinct de l\'identité civile'
                        }
                      >
                        <Input
                          placeholder={raData.entity?.denomination_commerciale || (isAr ? 'اترك فارغاً إذا لم يتغير' : 'Laisser vide si inchangé')}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Adresse — FR : adresse FR ; AR : adresse AR */}
                  <Row gutter={16}>
                    <Col span={16}>
                      <Form.Item
                        label={isAr ? 'العنوان المهني / محل الإقامة' : 'Adresse professionnelle / Domicile'}
                        name={isAr ? 'adresse_ar' : 'adresse'}
                      >
                        <Input.TextArea
                          rows={2}
                          dir={isAr ? 'rtl' : 'ltr'}
                          placeholder={
                            isAr
                              ? (raData.entity?.adresse_ar || raData.entity?.adresse || '')
                              : (raData.entity?.adresse || '')
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label={isAr ? 'المدينة' : 'Ville'} name="ville">
                        <Input placeholder={raData.entity?.ville || ''} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Contact */}
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label={isAr ? 'الهاتف' : 'Téléphone'} name="telephone">
                        <Input placeholder={raData.entity?.telephone || ''} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label={isAr ? 'البريد الإلكتروني' : 'E-mail'} name="email">
                        <Input type="email" placeholder={raData.entity?.email || ''} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Activité exercée */}
                  <Row gutter={16}>
                    <Col span={24}>
                      <Form.Item
                        label={isAr ? 'المهنة / النشاط المُمارَس' : 'Profession / Activité exercée'}
                        name="profession"
                        help={isAr
                          ? 'مثال: بيع المواد الغذائية، الاستيراد والتصدير…'
                          : 'Ex : Commerce de détail, Import-export, Vente de matériaux…'}
                      >
                        <Input.TextArea
                          rows={2}
                          dir={isAr ? 'rtl' : 'ltr'}
                          placeholder={raData.entity?.profession || (isAr ? 'اترك فارغاً إذا لم يتغير' : 'Laisser vide si inchangé')}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Gérant */}
                  <Divider style={{ margin: '8px 0 12px' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {isAr ? 'المسير' : 'Gérant'}
                    </Text>
                  </Divider>
                  {raData.entity?.gerant_actif && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={
                        isAr
                          ? `المسير الحالي : ${raData.entity.gerant_actif}`
                          : `Gérant actuel : ${raData.entity.gerant_actif}`
                      }
                    />
                  )}
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        label={isAr ? 'تعديل المسير' : 'Modification du gérant'}
                        name="gerant_option"
                        initialValue="inchange"
                      >
                        <Select>
                          <Option value="inchange">{isAr ? 'المسير غير متغير' : 'Gérant inchangé'}</Option>
                          <Option value="nouveau">{isAr ? 'تعيين مسير جديد' : 'Nouveau gérant'}</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.gerant_option !== cur.gerant_option}>
                    {({ getFieldValue }) => getFieldValue('gerant_option') === 'nouveau' && (
                      <Row gutter={16}>
                        <Col span={24}>
                          <Form.Item
                            label={isAr ? 'اسم المسير الجديد (كامل)' : 'Nom complet du nouveau gérant'}
                            name="nouveau_gerant_nom"
                            rules={[{
                              required: true,
                              message: isAr ? 'أدخل اسم المسير الجديد' : 'Saisissez le nom du nouveau gérant',
                            }]}
                          >
                            <Input
                              placeholder={isAr ? 'اللقب والاسم الكاملان للمسير الجديد' : 'Nom et prénom complets du nouveau gérant'}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}
                  </Form.Item>
                </>
              )}

              {/* N° RC non modifiable via inscription modificative — retiré du formulaire */}
            </Card>

            {/* ─── BLOC 4 : Motif / Date d'effet / Observations ────────── */}
            <Card
              size="small"
              style={{ marginBottom: 16, borderLeft: '4px solid #d97706' }}
              title={
                <Space>
                  <span style={{ background: '#d97706', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>4</span>
                  <span style={{ color: '#92400e', fontWeight: 600 }}>
                    {isAr ? 'السبب وتاريخ السريان والملاحظات' : 'Motif, date d\'effet et observations'}
                  </span>
                </Space>
              }
            >
              <Row gutter={16}>
                <Col span={16}>
                  <Form.Item
                    label={isAr ? 'المُقدِّم (اسم طالب التعديل)' : 'Demandeur'}
                    name="demandeur"
                    help={isAr
                      ? 'الاسم الكامل للشخص الذي يتقدم بطلب التعديل (يظهر في الشهادة)'
                      : 'Nom complet de la personne qui dépose la demande (figurera sur le certificat)'}
                  >
                    <Input
                      placeholder={isAr ? 'الاسم الكامل للمُقدِّم…' : 'Nom complet du demandeur…'}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={16}>
                  <Form.Item
                    label={
                      <span>
                        <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                        {isAr ? 'سبب التعديل' : 'Motif de la modification'}
                      </span>
                    }
                    name="motif"
                    rules={[{
                      required: true,
                      whitespace: true,
                      message: isAr ? 'سبب التعديل إلزامي.' : 'Le motif est obligatoire.',
                    }]}
                  >
                    <Input.TextArea
                      rows={3}
                      placeholder={isAr
                        ? 'صِف سبب طلب التعديل (مثال: تغيير الاسم التجاري أو العنوان…)'
                        : 'Décrivez le motif de la demande (ex : changement de dénomination, adresse…)'}
                      showCount
                      maxLength={500}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label={isAr ? 'تاريخ السريان' : 'Date d\'effet'}
                    name="date_effet"
                    help={isAr ? 'اختياري' : 'Optionnel'}
                  >
                    <Input
                      type="date"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label={isAr ? 'ملاحظات إضافية' : 'Observations complémentaires'}
                name="observations"
              >
                <Input.TextArea
                  rows={2}
                  placeholder={isAr ? 'ملاحظات إضافية (اختياري)…' : 'Observations complémentaires (optionnel)…'}
                  maxLength={1000}
                />
              </Form.Item>
            </Card>

            {/* ─── BLOC 5 : Pièces jointes ──────────────────────────────── */}
            <Card
              size="small"
              style={{ marginBottom: 16, borderLeft: '4px solid #6366f1' }}
              title={
                <Space>
                  <PaperClipOutlined style={{ color: '#6366f1' }} />
                  <span style={{ color: '#4338ca', fontWeight: 600 }}>
                    {isAr ? 'الوثائق المرفقة' : 'Pièces jointes'}
                  </span>
                </Space>
              }
            >
              <PiecesJointesPending
                pendingFiles={pendingFiles}
                onAddPending={(f) => setPendingFiles(prev => [...prev, f])}
                onRemovePending={(uid) => setPendingFiles(prev => prev.filter(p => p.uid !== uid))}
              />
            </Card>

            {/* ─── Boutons d'action ─────────────────────────────────────── */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              padding: '12px 0', borderTop: '1px solid #f0f0f0',
            }}>
              <Button onClick={() => navigate(id ? `/modifications/${id}` : '/modifications')}>
                {isAr ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button htmlType="submit" icon={<SaveOutlined />} loading={saveMut.isPending}>
                {isAr ? 'حفظ كمسودة' : 'Enregistrer en brouillon'}
              </Button>
              {(isEdit || isCorrection) && (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={saveMut.isPending}
                  onClick={onSaveAndSubmit}
                  style={{ background: '#1a4480' }}
                >
                  {isAr ? 'حفظ وإرسال إلى المسجل' : 'Enregistrer et soumettre au greffier'}
                </Button>
              )}
            </div>
          </Form>
        </Spin>
      )}
    </div>
  );
};

export default FormulaireModification;

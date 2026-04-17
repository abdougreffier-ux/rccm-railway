import React, { useState, useEffect } from 'react';
import {
  Form, Input, Button, Card, Row, Col, Alert, Spin,
  Typography, Select, DatePicker, Divider, message,
} from 'antd';
import {
  SearchOutlined, ArrowLeftOutlined, SendOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { cessionsFondsAPI, documentAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import NniInput, { uppercaseRule, nniRule } from '../../components/NniInput';
import { PiecesJointesPending } from '../../components/PiecesJointesCard';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const TYPE_ACTE_OPTIONS = [
  { value: 'NOTARIE',     label: 'Acte notarié',           label_ar: 'عقد رسمي' },
  { value: 'SEING_PRIVE', label: 'Acte sous seing privé',  label_ar: 'عقد عرفي' },
];

const FormulaireCessionFonds = () => {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { id }      = useParams();
  const { isAr }    = useLanguage();
  const [form]      = Form.useForm();

  const [raData,        setRaData]        = useState(null);
  const [lookupVal,     setLookupVal]     = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState('');
  const [pendingFiles,  setPendingFiles]  = useState([]);
  const [nationalites,  setNationalites]  = useState([]);

  // Charger les nationalités depuis l'API
  useEffect(() => {
    const fetchNats = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const r = await fetch('/api/parametrage/nationalites/?page_size=500', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        setNationalites(data.results || []);
      } catch {
        setNationalites([]);
      }
    };
    fetchNats();
  }, []);

  // Mode édition : charger les données existantes (React Query v5 — pas d'onSuccess dans useQuery)
  const { data: editData } = useQuery({
    queryKey: ['cessions-fonds-edit', id],
    queryFn:  () => cessionsFondsAPI.get(id).then(r => r.data),
    enabled:  !!id,
  });

  useEffect(() => {
    if (!editData) return;
    const d    = editData;
    const cess = d.cessionnaire_data || {};
    setLookupVal(d.ra_numero || '');
    form.setFieldsValue({
      date_cession:       d.date_cession      ? dayjs(d.date_cession)      : null,
      type_acte:          d.type_acte         || undefined,
      observations:       d.observations      || '',
      demandeur:          d.demandeur         || '',
      cess_nom:           cess.nom            || '',
      cess_prenom:        cess.prenom         || '',
      cess_nom_ar:        cess.nom_ar         || '',
      cess_prenom_ar:     cess.prenom_ar      || '',
      cess_nationalite:   cess.nationalite_id || undefined,
      cess_date_naiss:    cess.date_naissance ? dayjs(cess.date_naissance) : null,
      cess_lieu_naiss:    cess.lieu_naissance || '',
      cess_nni:           cess.nni            || '',
      cess_num_passeport: cess.num_passeport  || '',
      cess_adresse:       cess.adresse        || '',
      cess_telephone:     cess.telephone      || '',
      cess_email:         cess.email          || '',
    });
    // Charger les données RA si pas encore chargées
    if (d.ra_numero && !raData) {
      cessionsFondsAPI.lookup({ numero_ra: d.ra_numero })
        .then(r => setRaData(r.data))
        .catch(() => {});
    }
  }, [editData]); // eslint-disable-line

  const handleLookup = async () => {
    const v = lookupVal.trim();
    if (!v) {
      setLookupError(isAr ? 'أدخل الرقم التحليلي' : 'Saisissez un N° analytique.');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    try {
      const r = await cessionsFondsAPI.lookup({ numero_ra: v });
      setRaData(r.data);
    } catch (err) {
      setLookupError(
        err.response?.data?.detail ||
        (isAr ? 'ملف غير موجود أو غير متوافق' : 'Dossier introuvable ou incompatible.')
      );
      setRaData(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const buildPayload = (values) => {
    const cessionnaire_data = {
      nom:            (values.cess_nom          || '').trim(),
      prenom:         (values.cess_prenom       || '').trim(),
      nom_ar:         (values.cess_nom_ar       || '').trim(),
      prenom_ar:      (values.cess_prenom_ar    || '').trim(),
      nationalite_id: values.cess_nationalite   || null,
      date_naissance: values.cess_date_naiss
                        ? values.cess_date_naiss.format('YYYY-MM-DD') : null,
      lieu_naissance: (values.cess_lieu_naiss   || '').trim(),
      nni:            (values.cess_nni          || '').trim(),
      num_passeport:  (values.cess_num_passeport|| '').trim(),
      adresse:        (values.cess_adresse      || '').trim(),
      telephone:      (values.cess_telephone    || '').trim(),
      email:          (values.cess_email        || '').trim(),
    };
    return {
      ra:           raData.id,
      date_cession: values.date_cession ? values.date_cession.format('YYYY-MM-DDTHH:mm:ss') : null,
      type_acte:    values.type_acte || undefined,
      observations: (values.observations || '').trim(),
      demandeur:    (values.demandeur  || '').trim(),
      cessionnaire_data,
      // ── Langue de l'acte : déterminée à la création par la langue de l'interface ──
      ...(id ? {} : { langue_acte: isAr ? 'ar' : 'fr' }),
    };
  };

  const saveMut = useMutation({
    mutationFn: async (values) => {
      const payload = buildPayload(values);
      const res = id
        ? await cessionsFondsAPI.update(id, payload)
        : await cessionsFondsAPI.create(payload);
      const cfId = res.data.id;
      for (const pf of pendingFiles) {
        try {
          const fd = new FormData();
          fd.append('fichier',       pf.file);
          fd.append('nom_fichier',   pf.name);
          fd.append('cession_fonds', cfId);
          await documentAPI.upload(fd);
        } catch {
          message.warning(`Impossible d'uploader ${pf.name}.`);
        }
      }
      return res;
    },
    onSuccess: (res) => {
      message.success(isAr ? 'تم الحفظ بنجاح.' : 'Enregistrement réussi.');
      queryClient.invalidateQueries({ queryKey: ['cessions-fonds'] });
      navigate(`/cessions-fonds/${res.data.id}`);
    },
    onError: (e) => {
      const err = e.response?.data;
      if (err && typeof err === 'object' && !Array.isArray(err)) {
        const msgs = Object.entries(err)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        message.error(msgs);
      } else {
        message.error(isAr ? 'خطأ عند الحفظ.' : "Erreur lors de l'enregistrement.");
      }
    },
  });

  const onFinish = (values) => {
    if (!raData) {
      message.warning(isAr ? 'ابحث عن ملف أولاً.' : "Recherchez d'abord un dossier.");
      return;
    }
    saveMut.mutate(values);
  };

  const cedant = raData?.cedant || {};

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/cessions-fonds')} />
        <Title level={4} style={{ margin: 0 }}>
          {isAr
            ? (id ? 'تعديل تنازل عن المحل التجاري' : 'تنازل عن المحل التجاري — طلب جديد')
            : (id ? 'Modifier la cession de fonds' : 'Cession de fonds de commerce — Nouvelle demande')}
        </Title>
      </div>

      {/* ─── ÉTAPE 1 : Sélection du dossier ─────────────────────────────────── */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderLeft: '4px solid #1a4480' }}
        title={
          <Text strong style={{ color: '#1a4480' }}>
            {isAr ? '١. تحديد الملف' : '1. Sélection du dossier'}
          </Text>
        }
      >
        <Row gutter={12} align="middle">
          <Col flex="1">
            <Input
              placeholder={isAr ? 'الرقم التحليلي أو رقم السجل التجاري' : 'N° analytique ou N° RC'}
              value={lookupVal}
              onChange={e => setLookupVal(e.target.value)}
              onPressEnter={handleLookup}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col>
            <Button
              type="primary"
              style={{ background: '#1a4480' }}
              loading={lookupLoading}
              onClick={handleLookup}
            >
              {isAr ? 'بحث' : 'Rechercher'}
            </Button>
          </Col>
        </Row>

        {lookupError && (
          <Alert type="error" message={lookupError} style={{ marginTop: 10 }} showIcon />
        )}

        {raData && (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 10 }}
            message={
              <div>
                <Text strong>{raData.denomination}</Text>
                {raData.nom_commercial && raData.nom_commercial !== raData.denomination && (
                  <>
                    {' — '}
                    <Text type="secondary">
                      {isAr ? 'الاسم التجاري: ' : 'Nom commercial: '}{raData.nom_commercial}
                    </Text>
                  </>
                )}
                <br />
                <Text type="secondary">
                  {isAr ? 'الرقم التحليلي: ' : 'N° analytique: '}{raData.numero_ra}
                  {raData.numero_rc  && <> · {isAr ? 'رقم السجل: '     : 'N° RC: '}{raData.numero_rc}</>}
                  {raData.date_immat && <> · {isAr ? 'تاريخ التسجيل: ' : 'Immatriculé le: '}{raData.date_immat}</>}
                </Text>
              </div>
            }
          />
        )}
      </Card>

      {/* ─── ÉTAPE 2 & 3 : Formulaire principal ─────────────────────────────── */}
      {raData && (
        <Form form={form} layout="vertical" onFinish={onFinish}>

          {/* ÉTAPE 2 : Informations de la cession */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderLeft: '4px solid #52c41a' }}
            title={
              <Text strong style={{ color: '#52c41a' }}>
                {isAr ? '٢. معلومات التنازل' : '2. Informations de la cession'}
              </Text>
            }
          >
            <Form.Item
              label={isAr ? 'مقدم الطلب' : 'Demandeur'}
              name="demandeur"
              rules={[{ required: true, message: isAr ? 'مقدم الطلب إلزامي' : 'Le demandeur est obligatoire' }]}
              extra={isAr ? 'الشخص الذي يتقدم إلى السجل التجاري' : 'Personne qui se présente au registre du commerce'}
            >
              <Input placeholder={isAr ? 'الاسم الكامل لمقدم الطلب' : 'Nom complet du demandeur'} />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'تاريخ ووقت التنازل' : 'Date et heure de cession'}
                  name="date_cession"
                  rules={[{ required: true, message: isAr ? 'التاريخ والوقت إلزاميان' : 'La date et l\'heure sont obligatoires' }]}
                  extra={<span style={{ fontSize: 11, color: '#888' }}>{isAr ? 'الإهداء القانوني (التاريخ + الوقت)' : 'Horodatage légal de la cession'}</span>}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    showTime={{ format: 'HH:mm' }}
                    format="DD/MM/YYYY HH:mm"
                    placeholder={isAr ? 'يي/شش/سسسس سس:دد' : 'JJ/MM/AAAA HH:mm'}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'نوع العقد' : "Type d'acte"}
                  name="type_acte"
                  rules={[{ required: true, message: isAr ? 'اختر نوع العقد' : "Sélectionnez le type d'acte" }]}
                >
                  <Select placeholder={isAr ? 'اختر...' : 'Sélectionner...'}>
                    {TYPE_ACTE_OPTIONS.map(o => (
                      <Option key={o.value} value={o.value}>
                        {isAr ? o.label_ar : o.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label={isAr ? 'ملاحظات' : 'Observations'} name="observations">
              <TextArea
                rows={2}
                maxLength={500}
                placeholder={isAr ? 'ملاحظات اختيارية' : 'Observations (facultatif)'}
              />
            </Form.Item>

            {/* Pièces jointes */}
            <PiecesJointesPending
              pendingFiles={pendingFiles}
              onAddPending={(pf) => setPendingFiles(prev => [...prev, pf])}
              onRemovePending={(uid) => setPendingFiles(prev => prev.filter(f => f.uid !== uid))}
            />
          </Card>

          {/* ÉTAPE 3 : Cessionnaire (nouveau titulaire) */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderLeft: '4px solid #faad14' }}
            title={
              <Text strong style={{ color: '#faad14' }}>
                {isAr ? '٣. المتنازَل إليه (الشخص الجديد)' : '3. Cessionnaire — Nouveau titulaire'}
              </Text>
            }
            extra={
              cedant.nom && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {isAr
                    ? `المتنازِل الحالي: ${cedant.prenom || ''} ${cedant.nom}`.trim()
                    : `Cédant actuel: ${cedant.prenom || ''} ${cedant.nom}`.trim()}
                </Text>
              )
            }
          >
            {/* Cédant actuel (lecture seule) */}
            {cedant.nom && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={
                  <div>
                    <Text strong>
                      {isAr ? 'المتنازِل (الشخص الحالي المسجَّل)' : 'Cédant (titulaire actuel inscrit)'}
                    </Text>
                    <br />
                    <Text>
                      {cedant.prenom} {cedant.nom}
                      {cedant.nationalite && <> · {cedant.nationalite}</>}
                      {cedant.nni        && <> · NNI: {cedant.nni}</>}
                      {cedant.telephone  && <> · {cedant.telephone}</>}
                    </Text>
                  </div>
                }
              />
            )}

            <Divider style={{ margin: '4px 0 12px' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isAr ? 'هوية الشخص الجديد' : 'Identité du nouveau titulaire'}
              </Text>
            </Divider>

            {/* Nom / Prénom */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'اللقب (FR)' : 'Nom'}
                  name="cess_nom"
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
                  name="cess_prenom"
                  rules={[{ required: true, message: isAr ? 'الاسم إلزامي' : 'Le prénom est obligatoire' }]}
                >
                  <Input placeholder={isAr ? 'الاسم بالفرنسية' : 'Prénom'} />
                </Form.Item>
              </Col>
            </Row>

            {/* Nom / Prénom arabe */}
            {isAr && (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="اللقب (AR)" name="cess_nom_ar">
                    <Input dir="rtl" placeholder="اللقب بالعربية" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="الاسم (AR)" name="cess_prenom_ar">
                    <Input dir="rtl" placeholder="الاسم بالعربية" />
                  </Form.Item>
                </Col>
              </Row>
            )}

            {/* Nationalité + Date naissance */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'الجنسية' : 'Nationalité'}
                  name="cess_nationalite"
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
                  label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}
                  name="cess_date_naiss"
                >
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>

            {/* Lieu naissance + NNI */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}
                  name="cess_lieu_naiss"
                >
                  <Input placeholder={isAr ? 'مكان الميلاد' : 'Ville / pays de naissance'} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'رقم الهوية الوطنية (NNI)' : 'NNI'}
                  name="cess_nni"
                  rules={[nniRule(isAr)]}
                >
                  <NniInput placeholder="NNI" />
                </Form.Item>
              </Col>
            </Row>

            {/* Passeport + Adresse */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'رقم جواز السفر' : 'N° Passeport'}
                  name="cess_num_passeport"
                >
                  <Input placeholder={isAr ? 'رقم جواز السفر' : 'Si pas de NNI'} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'العنوان' : 'Adresse'}
                  name="cess_adresse"
                >
                  <Input placeholder={isAr ? 'العنوان' : 'Adresse domicile'} />
                </Form.Item>
              </Col>
            </Row>

            {/* Téléphone + Email */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'الهاتف' : 'Téléphone / Contact'}
                  name="cess_telephone"
                >
                  <Input placeholder={isAr ? 'رقم الهاتف' : 'Téléphone'} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={isAr ? 'البريد الإلكتروني' : 'E-mail'}
                  name="cess_email"
                >
                  <Input type="email" placeholder="Email" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Boutons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => navigate('/cessions-fonds')}>
              {isAr ? 'إلغاء' : 'Annuler'}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              loading={saveMut.isPending}
              style={{ background: '#1a4480' }}
            >
              {isAr ? 'حفظ' : 'Enregistrer'}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
};

export default FormulaireCessionFonds;

import React, { useState } from 'react';
import {
  Card, Button, Table, Select, Tag, Typography, Space, Modal,
  Form, Input, message, Row, Col, Alert, Tooltip, Divider,
} from 'antd';
import {
  SafetyCertificateOutlined, FilePdfOutlined, PlusOutlined,
  SearchOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { certificatsAPI, openPDF } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;
const { Option }      = Select;

// ── Types de certificats disponibles ─────────────────────────────────────────
const TYPES_CERTIFICAT = [
  {
    value:   'NON_FAILLITE',
    labelFr: 'Certificat de non faillite',
    labelAr: 'شهادة عدم الإفلاس',
    color:   'blue',
  },
  {
    value:   'NON_LITIGE',
    labelFr: 'Certificat de non litige',
    labelAr: 'شهادة عدم النزاع',
    color:   'green',
  },
  {
    value:   'NEG_PRIVILEGES',
    labelFr: 'Certificat négatif de privilèges et de nantissements',
    labelAr: 'شهادة سلبية بالامتيازات والرهون',
    color:   'orange',
  },
  {
    value:   'ABS_PROCEDURE_COLLECTIVE',
    labelFr: "Certificat d'absence de procédure collective",
    labelAr: 'شهادة انعدام إجراءات التسوية الجماعية',
    color:   'purple',
  },
  {
    value:   'NON_LIQUIDATION',
    labelFr: 'Certificat de non liquidation judiciaire',
    labelAr: 'شهادة عدم التصفية القضائية',
    color:   'red',
  },
];

const typeLabel = (value, isAr) => {
  const t = TYPES_CERTIFICAT.find(x => x.value === value);
  if (!t) return value;
  return isAr ? t.labelAr : t.labelFr;
};

const typeColor = (value) =>
  TYPES_CERTIFICAT.find(x => x.value === value)?.color || 'default';

// ── Libellé de langue ─────────────────────────────────────────────────────────
const langueLabel = (langue) =>
  langue === 'AR' ? 'عربي' : 'FR';

const langueColor = (langue) =>
  langue === 'AR' ? 'gold' : 'geekblue';

// ── Composant principal ───────────────────────────────────────────────────────
const ListeCertificats = () => {
  const { isAr }        = useLanguage();
  const { hasRole }     = useAuth();
  const queryClient     = useQueryClient();
  const isGreffier      = hasRole('GREFFIER');

  // La langue du certificat est fixée par la langue de la session en cours.
  // Règle RCCM : un certificat est délivré dans une seule langue, celle de la session.
  const sessionLangue = isAr ? 'AR' : 'FR';

  const [form]          = Form.useForm();
  const [showModal, setShowModal]   = useState(false);
  const [raSearch, setRaSearch]     = useState('');
  const [raOptions, setRaOptions]   = useState([]);
  const [raLoading, setRaLoading]   = useState(false);
  const [selectedRA, setSelectedRA] = useState(null);

  // ── Chargement de la liste ──────────────────────────────────────────────────
  const { data: certificats = [], isLoading } = useQuery({
    queryKey: ['certificats'],
    queryFn:  () => certificatsAPI.list().then(r => r.data),
  });

  // ── Recherche d'entité ──────────────────────────────────────────────────────
  const _raLabel = (ra) => {
    const nom = ra.denomination || ra.denomination_ar || '—';
    const num = ra.numero_ra    || ra.numero_rc       || '—';
    return `${num} — ${nom}`;
  };

  const searchRA = async (query) => {
    if (!query || query.length < 1) { setRaOptions([]); return; }
    setRaLoading(true);
    try {
      const res   = await certificatsAPI.searchEntite(query);
      const items = res.data || [];
      setRaOptions(items.map(ra => ({ value: ra.id, label: _raLabel(ra), ra })));
    } catch {
      // silencieux
    } finally {
      setRaLoading(false);
    }
  };

  // ── Mutation délivrance ─────────────────────────────────────────────────────
  const delivrerMut = useMutation({
    mutationFn: (data) => certificatsAPI.create(data),
    onSuccess: (res) => {
      const num    = res.data?.numero || '';
      const langue = res.data?.langue || sessionLangue;
      message.success(isAr
        ? `تم إصدار الشهادة ${num} باللغة ${langue === 'AR' ? 'العربية' : 'الفرنسية'} بنجاح.`
        : `Certificat ${num} délivré en ${langue === 'AR' ? 'arabe' : 'français'} avec succès.`
      );
      queryClient.invalidateQueries({ queryKey: ['certificats'] });
      _resetModal();
    },
    onError: (e) => {
      const msg = isAr
        ? (e.response?.data?.detail_ar || e.response?.data?.detail || 'حدث خطأ.')
        : (e.response?.data?.detail    || 'Une erreur est survenue.');
      message.error(msg);
    },
  });

  const _resetModal = () => {
    setShowModal(false);
    form.resetFields();
    setSelectedRA(null);
    setRaOptions([]);
  };

  const onFinish = (values) => {
    delivrerMut.mutate({
      type_certificat: values.type_certificat,
      ra:              values.ra_id,
      observations:    values.observations || '',
      // ── Langue figée à la délivrance — langue de la session greffier ──────
      langue:          sessionLangue,
    });
  };

  // ── Colonnes du tableau ─────────────────────────────────────────────────────
  const columns = [
    {
      title:     isAr ? 'الرقم' : 'N° Certificat',
      dataIndex: 'numero',
      key:       'numero',
      width:     170,
      render:    v => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    {
      title:  isAr ? 'النوع' : 'Type',
      key:    'type',
      render: (_, r) => (
        <Tag color={typeColor(r.type_certificat)} style={{ whiteSpace: 'normal', maxWidth: 260 }}>
          {typeLabel(r.type_certificat, isAr)}
        </Tag>
      ),
    },
    {
      title:  isAr ? 'الجهة المعنية' : 'Entité',
      key:    'entite',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.ra_denomination || '—'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.ra_numero_rc || '—'}
            {r.ra_type_entite && (
              <Tag style={{ marginLeft: 4, fontSize: 10 }} color="geekblue">
                {r.ra_type_entite}
              </Tag>
            )}
          </Text>
        </Space>
      ),
    },
    {
      title:  isAr ? 'اللغة' : 'Langue',
      key:    'langue',
      width:  80,
      render: (_, r) => (
        <Tooltip
          title={isAr
            ? (r.langue === 'AR' ? 'صادرة بالعربية' : 'صادرة بالفرنسية')
            : (r.langue === 'AR' ? 'Délivré en arabe' : 'Délivré en français')}
        >
          <Tag color={langueColor(r.langue)} icon={<GlobalOutlined />}>
            {langueLabel(r.langue)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title:  isAr ? 'تاريخ الإصدار' : 'Date de délivrance',
      key:    'date',
      render: (_, r) => r.date_delivrance
        ? new Date(r.date_delivrance).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
        : '—',
    },
    {
      title:     isAr ? 'الكاتب العام' : 'Délivré par',
      dataIndex: 'delivre_par_nom',
      key:       'par',
      render:    v => v || '—',
    },
    {
      title:  isAr ? 'الإجراءات' : 'Actions',
      key:    'actions',
      width:  80,
      render: (_, r) => {
        // ── Une seule icône — langue figée du certificat ─────────────────────
        // Règle RCCM : impossible d'imprimer dans une autre langue que celle
        // de la délivrance. Un nouveau certificat doit être délivré si besoin.
        const certLang  = (r.langue || 'FR').toLowerCase();
        const tooltipTx = isAr
          ? (r.langue === 'AR' ? 'طباعة النسخة العربية' : 'طباعة النسخة الفرنسية')
          : (r.langue === 'AR' ? 'Imprimer (version arabe)' : 'Imprimer (version française)');
        return (
          <Tooltip title={tooltipTx}>
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              type="primary"
              ghost
              style={r.langue === 'AR'
                ? { color: '#d46b08', borderColor: '#d46b08' }
                : undefined}
              onClick={() => openPDF(certificatsAPI.pdf(r.id, certLang))}
            />
          </Tooltip>
        );
      },
    },
  ];

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 8px' }}>
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16,
      }}>
        <Title level={4} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          {isAr ? 'شهادات كاتب الضبط' : 'Certificats du greffier'}
        </Title>
        {isGreffier && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowModal(true)}>
            {isAr ? 'إصدار شهادة' : 'Délivrer un certificat'}
          </Button>
        )}
      </div>

      {/* ── Types disponibles ─────────────────────────────────────────────── */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={isAr ? 'أنواع الشهادات المتاحة' : 'Types de certificats disponibles'}
        description={
          <Row gutter={[8, 4]} style={{ marginTop: 6 }}>
            {TYPES_CERTIFICAT.map(tc => (
              <Col key={tc.value} xs={24} sm={12} lg={8}>
                <Tag color={tc.color} style={{ whiteSpace: 'normal' }}>
                  {isAr ? tc.labelAr : tc.labelFr}
                </Tag>
              </Col>
            ))}
          </Row>
        }
      />

      {/* ── Tableau ──────────────────────────────────────────────────────── */}
      <Card>
        <Table
          dataSource={certificats}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: isAr
              ? 'لا توجد شهادات مسجلة بعد.'
              : 'Aucun certificat délivré pour le moment.',
          }}
        />
      </Card>

      {/* ── Modal délivrance ─────────────────────────────────────────────── */}
      {isGreffier && (
        <Modal
          title={
            <Space>
              <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
              {isAr ? 'إصدار شهادة جديدة' : 'Délivrer un nouveau certificat'}
            </Space>
          }
          open={showModal}
          onCancel={_resetModal}
          footer={null}
          width={620}
          destroyOnClose
        >
          <Divider style={{ margin: '12px 0' }} />

          {/* Avertissement immuabilité */}
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={isAr
              ? 'تنبيه : لا يمكن تعديل أو حذف الشهادة بعد إصدارها.'
              : 'Attention : une fois délivré, le certificat ne peut plus être modifié ni supprimé.'}
          />

          {/* Information langue figée — règle RCCM */}
          <Alert
            type="info"
            showIcon
            icon={<GlobalOutlined />}
            style={{ marginBottom: 16 }}
            message={isAr
              ? `ستُصدَر هذه الشهادة باللغة العربية (لغة الجلسة الحالية).`
              : `Ce certificat sera délivré en français (langue de la session en cours).`}
            description={isAr
              ? 'للحصول على شهادة بالفرنسية، يجب تسجيل الدخول بالنسخة الفرنسية وإصدار شهادة جديدة.'
              : 'Pour obtenir un certificat en arabe, connectez-vous en version arabe et délivrez un nouveau certificat distinct.'}
          />

          <Form form={form} layout="vertical" onFinish={onFinish}>
            {/* Type de certificat */}
            <Form.Item
              name="type_certificat"
              label={isAr ? 'نوع الشهادة' : 'Type de certificat'}
              rules={[{ required: true, message: isAr ? 'يرجى اختيار نوع الشهادة' : 'Choisissez le type de certificat' }]}
            >
              <Select
                placeholder={isAr ? 'اختر النوع...' : 'Sélectionner le type...'}
                size="large"
              >
                {TYPES_CERTIFICAT.map(tc => (
                  <Option key={tc.value} value={tc.value}>
                    <Tag color={tc.color}>{isAr ? tc.labelAr : tc.labelFr}</Tag>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* Entité */}
            <Form.Item
              name="ra_id"
              label={isAr
                ? 'الجهة المعنية (مُسجَّلة في السجل التجاري)'
                : 'Entité concernée (immatriculée au RC)'}
              rules={[{ required: true, message: isAr ? 'يرجى اختيار الجهة' : "Sélectionnez l'entité" }]}
            >
              <Select
                showSearch
                filterOption={false}
                onSearch={searchRA}
                loading={raLoading}
                placeholder={isAr
                  ? 'ابحث بالاسم أو رقم السجل...'
                  : 'Rechercher par nom ou N° RC / analytique...'}
                size="large"
                suffixIcon={<SearchOutlined />}
                onChange={(val, opt) => setSelectedRA(opt?.ra || null)}
                notFoundContent={raLoading
                  ? (isAr ? 'جارٍ البحث...' : 'Recherche en cours...')
                  : (isAr ? 'لا نتائج — جرب رقم السجل أو الاسم' : 'Aucun résultat — essayez le N° RC ou le nom')}
              >
                {raOptions.map(o => (
                  <Option key={o.value} value={o.value} ra={o.ra}>
                    {o.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* Aperçu entité sélectionnée */}
            {selectedRA && (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 12 }}
                message={isAr ? 'الجهة المختارة' : 'Entité sélectionnée'}
                description={
                  <Space direction="vertical" size={2}>
                    <Text strong>{selectedRA.denomination || '—'}</Text>
                    <Text type="secondary">{selectedRA.numero_rc || selectedRA.numero_ra || '—'}</Text>
                    <Tag color="geekblue">{selectedRA.type_entite}</Tag>
                  </Space>
                }
              />
            )}

            {/* Observations */}
            <Form.Item
              name="observations"
              label={isAr ? 'ملاحظات (اختياري)' : 'Observations (facultatif)'}
            >
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>

            <Divider style={{ margin: '8px 0 16px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={_resetModal}>
                {isAr ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={delivrerMut.isPending}
                icon={<SafetyCertificateOutlined />}
              >
                {isAr
                  ? `إصدار الشهادة (${sessionLangue === 'AR' ? 'عربي' : 'FR'})`
                  : `Délivrer le certificat (${sessionLangue === 'FR' ? 'français' : 'arabe'})`}
              </Button>
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
};

export default ListeCertificats;

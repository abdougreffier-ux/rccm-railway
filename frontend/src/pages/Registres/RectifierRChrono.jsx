import React, { useEffect } from 'react';
import {
  Card, Form, Input, Select, DatePicker, Button, Space, Typography,
  Spin, Alert, message, Divider,
} from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { registreAPI } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import { useLanguage } from '../../contexts/LanguageContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title } = Typography;
const { TextArea } = Input;

const TYPE_ACTE_OPTIONS = [
  { value: 'IMMATRICULATION', label: 'Immatriculation' },
  { value: 'MODIFICATION',    label: 'Modification' },
  { value: 'RADIATION',       label: 'Radiation' },
  { value: 'DEPOT',           label: 'Dépôt de document' },
  { value: 'CONSTITUTION',    label: 'Constitution' },
];

const DESCRIPTION_LABELS = {
  denomination_commerciale: 'Dénomination / Nom commercial',
  activite:                 'Activité principale',
  objet_social:             'Objet social',
  origine_fonds:            'Origine des fonds',
  identite_declarant:       'Identité du déclarant',
  identite_representant:    'Identité du représentant local',
};

// Clés i18n pour l'affichage en arabe (FR préservé ci-dessus)
const DESCRIPTION_LABELS_AR = {
  denomination_commerciale: 'rc.desc.denomNomCommercial',
  activite:                 'rc.desc.activitePrincipale',
  objet_social:             'field.objetSocial',
  origine_fonds:            'field.origineFonds',
  identite_declarant:       'rc.desc.identiteDeclarant',
  identite_representant:    'rc.desc.identiteRepresentant',
};

const RectifierRChrono = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { t, isAr } = useLanguage();
  const queryClient = useQueryClient();
  const [form]      = Form.useForm();

  // ── Charger le RC existant ──────────────────────────────────────────────────
  const { data: rc, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rchrono-detail', id],
    queryFn:  () => registreAPI.getChrono(id).then(r => r.data),
  });

  // ── Pré-remplir le formulaire dès que les données arrivent ─────────────────
  useEffect(() => {
    if (!rc) return;

    // Vérifier que la rectification est autorisée
    if (rc.statut !== 'BROUILLON' && rc.statut !== 'RETOURNE') {
      message.error('La rectification n\'est pas autorisée dans l\'état actuel du dossier.');
      navigate(`/registres/chronologique/${id}`);
      return;
    }

    let descParsed = {};
    try {
      descParsed = typeof rc.description_parsed === 'object'
        ? rc.description_parsed
        : JSON.parse(rc.description || '{}');
    } catch {}

    form.setFieldsValue({
      type_acte:    rc.type_acte,
      date_acte:    rc.date_acte ? dayjs(rc.date_acte) : null,
      observations: rc.observations || '',
      // Champs de description
      denomination_commerciale: descParsed.denomination_commerciale || '',
      activite:                 descParsed.activite                 || '',
      objet_social:             descParsed.objet_social             || '',
      origine_fonds:            descParsed.origine_fonds            || '',
      identite_declarant:       descParsed.identite_declarant       || '',
      identite_representant:    descParsed.identite_representant    || '',
    });
  }, [rc, form, id, navigate]);

  // ── Mutation rectification ──────────────────────────────────────────────────
  const rectifierMut = useMutation({
    mutationFn: (payload) => registreAPI.rectifierChrono(id, payload),
    onSuccess: () => {
      message.success('Dossier rectifié avec succès.');
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rchrono'] });
      navigate(`/registres/chronologique/${id}`);
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Soumission ─────────────────────────────────────────────────────────────
  const handleFinish = (values) => {
    // Reconstruire le JSON de description en préservant les clés existantes
    let descParsed = {};
    try {
      descParsed = typeof rc.description_parsed === 'object'
        ? { ...rc.description_parsed }
        : JSON.parse(rc.description || '{}');
    } catch {}

    const descriptionFields = [
      'denomination_commerciale', 'activite', 'objet_social',
      'origine_fonds', 'identite_declarant', 'identite_representant',
    ];
    descriptionFields.forEach(key => {
      if (values[key] !== undefined) {
        descParsed[key] = values[key];
      }
    });

    rectifierMut.mutate({
      type_acte:    values.type_acte,
      date_acte:    values.date_acte ? values.date_acte.format('YYYY-MM-DD') : null,
      observations: values.observations || '',
      description:  descParsed,
    });
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!rc)       return <AccessDenied onRetry={refetch} style="inline" />;

  const statutLabel = rc.statut === 'RETOURNE' ? 'Retourné' : 'Brouillon';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          ✏️ Rectification — <strong>{fmtChrono(rc.numero_chrono)}</strong>
        </Title>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/registres/chronologique/${id}`)}>
          {t('common.back')}
        </Button>
      </div>

      {rc.statut === 'RETOURNE' && rc.observations && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Corrections demandées par le greffier"
          description={rc.observations}
        />
      )}

      <Card
        title={
          <Space>
            <span>Acte N° {fmtChrono(rc.numero_chrono)}</span>
            <span style={{ color: '#888', fontWeight: 'normal', fontSize: 13 }}>
              — Statut : {statutLabel}
            </span>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
        >
          {/* ── Informations de l'acte ──────────────────────────────────────── */}
          <Divider orientation="left" style={{ fontSize: 13 }}>Informations de l'acte</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="type_acte"
              label={t('rc.type_acte')}
              rules={[{ required: true, message: 'Type d\'acte requis' }]}
            >
              <Select options={TYPE_ACTE_OPTIONS} placeholder="Sélectionner..." />
            </Form.Item>

            <Form.Item
              name="date_acte"
              label={t('rc.date_acte')}
              rules={[{ required: true, message: 'Date de l\'acte requise' }]}
            >
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="observations" label={t('field.observations')}>
            <TextArea rows={3} placeholder="Observations éventuelles..." />
          </Form.Item>

          {/* ── Données complémentaires ─────────────────────────────────────── */}
          <Divider orientation="left" style={{ fontSize: 13 }}>
            {isAr ? t('section.infoCommerciales') : 'Données complémentaires'}
          </Divider>

          {Object.entries(DESCRIPTION_LABELS).map(([key, frLabel]) => {
            const label = isAr ? t(DESCRIPTION_LABELS_AR[key]) : frLabel;
            return (
              <Form.Item key={key} name={key} label={label}>
                <TextArea rows={2} placeholder={label} autoSize={{ minRows: 1, maxRows: 4 }} />
              </Form.Item>
            );
          })}

          {/* ── Boutons ─────────────────────────────────────────────────────── */}
          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={rectifierMut.isPending}
                style={{ background: '#1a4480', borderColor: '#1a4480' }}
              >
                Enregistrer les corrections
              </Button>
              <Button onClick={() => navigate(`/registres/chronologique/${id}`)}>
                {t('common.cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default RectifierRChrono;

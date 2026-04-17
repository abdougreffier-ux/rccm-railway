import React from 'react';
import {
  Form, Input, Card, Button, Typography, message, Spin,
  Descriptions, Tag, Alert,
} from 'antd';
import { ArrowLeftOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { rbeAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;
const { TextArea } = Input;

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_ATTENTE:  'processing',
  RETOURNE:    'warning',
  VALIDE:      'success',
  MODIFIE:     'cyan',
  RADIE:       'error',
};

const FormulaireRadiationRBE = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { t }    = useLanguage();
  const [form]   = Form.useForm();

  // ── Données de la déclaration à radier ───────────────────────────────────────
  const { data: rbe, isLoading } = useQuery({
    queryKey: ['rbe-detail', id],
    queryFn:  () => rbeAPI.get(id).then(r => r.data),
  });

  // ── Mutation radiation ───────────────────────────────────────────────────────
  const radierMut = useMutation({
    mutationFn: (data) => rbeAPI.radier(id, data),
    onSuccess: (res) => {
      message.success('Radiation enregistrée avec succès.');
      // Navigate to the new radiation declaration
      navigate(`/registres/rbe/${res.data.id}`);
    },
    onError: (e) => {
      const err = e.response?.data;
      message.error(typeof err === 'string' ? err : err?.detail || t('msg.error'));
    },
  });

  const handleSubmit = () => {
    form.validateFields().then(vals => {
      radierMut.mutate(vals);
    });
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!rbe) return null;

  const STATUT_LABELS = {
    BROUILLON: 'Brouillon', EN_ATTENTE: 'En attente', RETOURNE: 'Retourné',
    VALIDE: 'Validé', MODIFIE: 'Modifié', RADIE: 'Radié',
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/registres/rbe/${id}`)}>
          {t('common.back')}
        </Button>
        <Title level={4} style={{ margin: 0, color: '#d32f2f' }}>
          🚫 {t('rbe.radier')} — {rbe.numero_rbe}
        </Title>
      </div>

      {/* ── Avertissement ─────────────────────────────────────────────────────── */}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Radiation de déclaration RBE"
        description="Cette opération va créer une déclaration de type RADIATION. Elle est irréversible une fois validée par le greffier."
      />

      {/* ── Déclaration à radier ─────────────────────────────────────────────── */}
      <Card title="Déclaration à radier" style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="N° RBE" span={1}>
            <strong>{rbe.numero_rbe}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Statut" span={1}>
            <Tag color={STATUT_COLOR[rbe.statut]}>{STATUT_LABELS[rbe.statut] || rbe.statut}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Type d'entité" span={1}>{rbe.type_entite}</Descriptions.Item>
          <Descriptions.Item label="Dénomination" span={1}>
            {rbe.denomination || rbe.denomination_entite || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Date déclaration" span={1}>{rbe.date_declaration || '—'}</Descriptions.Item>
          <Descriptions.Item label="Bénéficiaires" span={1}>
            {(rbe.beneficiaires || []).length} bénéficiaire(s)
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* ── Formulaire radiation ─────────────────────────────────────────────── */}
      <Form form={form} layout="vertical">
        <Card title="Motif de radiation" style={{ marginBottom: 16 }}>
          <Form.Item
            name="motif"
            label="Motif de radiation"
            rules={[{ required: true, message: 'Le motif de radiation est obligatoire' }]}
          >
            <TextArea
              rows={4}
              placeholder="Décrivez les raisons de cette radiation (dissolution, liquidation, cessation d'activité…)"
            />
          </Form.Item>
        </Card>

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
            danger
            icon={<StopOutlined />}
            loading={radierMut.isPending}
            onClick={handleSubmit}
          >
            Confirmer la radiation
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default FormulaireRadiationRBE;

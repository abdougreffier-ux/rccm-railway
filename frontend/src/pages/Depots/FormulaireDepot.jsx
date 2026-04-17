import React, { useState } from 'react';
import {
  Form, Input, Select, InputNumber, Button, Card, Row, Col,
  Typography, Space, Upload, message,
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, UploadOutlined, PaperClipOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { depotAPI, parametrageAPI, documentAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { getCiviliteOptions } from '../../utils/civilite';

const { Title, Text } = Typography;
const { TextArea }    = Input;

const FormulaireDepot = () => {
  const { id }      = useParams();              // present = edit mode
  const isEdit      = Boolean(id);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [form]      = Form.useForm();
  const [fileList,  setFileList]  = useState([]);
  const { t, field, isAr }        = useLanguage();

  // ── Load existing depot (edit mode) ─────────────────────────────────────
  useQuery({
    queryKey: ['depot', id],
    queryFn:  () => depotAPI.get(id).then(r => r.data),
    enabled:  isEdit,
    onSuccess: (data) => form.setFieldsValue({
      prenom_deposant:    data.prenom_deposant,
      nom_deposant:       data.nom_deposant,
      telephone_deposant: data.telephone_deposant,
      denomination:       data.denomination,
      forme_juridique:    data.forme_juridique,
      objet_social:       data.objet_social,
      capital:            data.capital ? parseFloat(data.capital) : null,
      siege_social:       data.siege_social,
      observations:       data.observations,
    }),
  });

  // ── Formes juridiques ─────────────────────────────────────────────────────
  const { data: formesData } = useQuery({
    queryKey: ['formes-juridiques'],
    queryFn:  () => parametrageAPI.formesJuridiques().then(r => r.data?.results || r.data || []),
  });
  const formes = formesData || [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (values) =>
      isEdit ? depotAPI.update(id, values) : depotAPI.create(values),
    onSuccess: async (response) => {
      const depotId = response.data?.id;
      // Upload pièces jointes
      if (!isEdit && fileList.length > 0 && depotId) {
        const uploads = fileList.map(f => {
          const fd = new FormData();
          fd.append('fichier', f.originFileObj || f);
          fd.append('depot', depotId);
          return documentAPI.upload(fd).catch(() => null);
        });
        await Promise.all(uploads);
      }
      message.success(isEdit ? 'Dépôt modifié avec succès.' : 'Dépôt créé avec succès.');
      queryClient.invalidateQueries({ queryKey: ['depots'] });
      if (depotId) navigate(`/depots/${depotId}`);
      else navigate('/depots');
    },
    onError: (e) => {
      const err = e.response?.data;
      message.error(typeof err === 'string' ? err : err?.detail || 'Erreur lors de la sauvegarde.');
    },
  });

  const onFinish = (values) => {
    const clean = { ...values };
    if (clean.capital === undefined || clean.capital === null || clean.capital === '') {
      clean.capital = null;
    }
    saveMut.mutate(clean);
  };

  const handlePreview = (file) => {
    const raw = file.originFileObj || file;
    if (!raw) return;
    const url = URL.createObjectURL(raw);
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const inlineable = ['pdf','png','jpg','jpeg','gif','webp','svg'].includes(ext);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (!inlineable) a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/depots')}>
          Retour
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          📥 {isEdit ? 'Modifier le dépôt' : 'Nouveau dépôt'}
        </Title>
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish}>

        {/* ── Numéro automatique (information) ─────────────────────────── */}
        {!isEdit && (
          <Card size="small" style={{ marginBottom: 16, background: '#f0f4fa', borderColor: '#1a4480' }}>
            <Text type="secondary">
              ℹ️ Le <strong>numéro de dépôt</strong> et la <strong>date de dépôt</strong> sont générés automatiquement à la création.
            </Text>
          </Card>
        )}

        {/* ── Déposant ─────────────────────────────────────────────────── */}
        <Card title="👤 Déposant" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={4}>
              <Form.Item name="civilite_deposant" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
                <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="prenom_deposant" label="Prénom" rules={[{ required: true, message: 'Prénom requis' }]}>
                <Input placeholder="Prénom du déposant" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="nom_deposant" label="Nom" rules={[{ required: true, message: 'Nom requis' }]}>
                <Input placeholder="Nom du déposant" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="telephone_deposant" label="Téléphone">
                <Input placeholder="Numéro de téléphone" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── Entité déposée ────────────────────────────────────────────── */}
        <Card title="🏢 Entité déposée" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="denomination" label="Dénomination" rules={[{ required: true, message: 'Dénomination requise' }]}>
                <Input placeholder="Raison sociale / Nom commercial" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="forme_juridique" label="Forme juridique">
                <Select
                  showSearch
                  allowClear
                  placeholder="Sélectionner..."
                  filterOption={(input, opt) =>
                    (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={formes.map(f => ({
                    value: f.id,
                    label: `${f.code} – ${field(f, 'libelle')}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="capital" label="Capital (MRU)">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={1000}
                  formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                  parser={v => v.replace(/\s/g, '')}
                  placeholder="Montant en MRU"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="siege_social" label="Siège social">
                <Input placeholder="Adresse du siège" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="objet_social" label="Objet social">
                <TextArea rows={3} placeholder="Description de l'objet social..." />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── Observations ──────────────────────────────────────────────── */}
        <Card title="📝 Observations" style={{ marginBottom: 16 }}>
          <Form.Item name="observations" style={{ marginBottom: 0 }}>
            <TextArea rows={3} placeholder="Observations éventuelles..." />
          </Form.Item>
        </Card>

        {/* ── Pièces jointes (création uniquement) ─────────────────────── */}
        {!isEdit && (
          <Card
            title={<Space><PaperClipOutlined /><span>Pièces jointes</span></Space>}
            style={{ marginBottom: 16 }}
          >
            <Upload
              multiple
              beforeUpload={(file) => { setFileList(prev => [...prev, file]); return false; }}
              onRemove={(file) => setFileList(prev => prev.filter(f => f.uid !== file.uid))}
              onPreview={handlePreview}
              fileList={fileList}
              showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
            >
              <Button icon={<UploadOutlined />} style={{ borderColor: '#1a4480', color: '#1a4480' }}>
                Ajouter une pièce jointe
              </Button>
            </Upload>
            {fileList.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                {fileList.length} fichier{fileList.length > 1 ? 's' : ''} sélectionné{fileList.length > 1 ? 's' : ''}
              </Text>
            )}
          </Card>
        )}

        {/* ── Boutons ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={() => navigate('/depots')}>Annuler</Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saveMut.isPending}
            style={{ background: '#1a4480' }}
          >
            {isEdit ? 'Enregistrer les modifications' : 'Créer le dépôt'}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default FormulaireDepot;

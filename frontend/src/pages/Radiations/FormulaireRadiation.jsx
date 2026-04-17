import React, { useState } from 'react';
import {
  Form, Input, Button, Card, Row, Col,
  Alert, Spin, Typography, Select, DatePicker, message,
} from 'antd';
import { SearchOutlined, ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { radiationAPI, documentAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { PiecesJointesPending } from '../../components/PiecesJointesCard';
import { getMotifOptions } from './motifRadiation';

const { Title, Text } = Typography;

const FormulaireRadiation = () => {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { isAr }    = useLanguage();
  const [form]      = Form.useForm();

  const [raData,        setRaData]        = useState(null);
  const [lookupVal,     setLookupVal]     = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState('');
  const [pendingFiles,  setPendingFiles]  = useState([]);

  const handleLookup = async () => {
    const v = lookupVal.trim();
    if (!v) { setLookupError('Saisissez un N° analytique.'); return; }
    setLookupLoading(true);
    setLookupError('');
    try {
      const r = await radiationAPI.lookup({ numero_ra: v });
      setRaData(r.data);
    } catch (err) {
      setLookupError(err.response?.data?.detail || 'Dossier introuvable ou incompatible.');
      setRaData(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: async (data) => {
      const res = await radiationAPI.create(data);
      const radId = res.data.id;
      for (const pf of pendingFiles) {
        try {
          const fd = new FormData();
          fd.append('fichier',    pf.file);
          fd.append('nom_fichier', pf.name);
          fd.append('radiation',  radId);
          await documentAPI.upload(fd);
        } catch {
          message.warning(`Impossible d'uploader ${pf.name}.`);
        }
      }
      return res;
    },
    onSuccess: (res) => {
      message.success('Demande de radiation enregistrée.');
      queryClient.invalidateQueries({ queryKey: ['radiations'] });
      navigate(`/radiations/${res.data.id}`);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Erreur lors de l\'enregistrement.'),
  });

  const onFinish = (values) => {
    if (!raData) { message.warning('Recherchez d\'abord un dossier.'); return; }
    if (pendingFiles.length === 0) {
      message.warning('Une pièce justificative est obligatoire.');
      return;
    }
    saveMut.mutate({
      ra:          raData.id,
      motif:       values.motif,
      description: values.description || '',
      demandeur:   (values.demandeur || '').trim(),
      date_acte:   values.date_acte ? values.date_acte.format('YYYY-MM-DDTHH:mm:ss') : null,
      // ── Langue de l'acte : déterminée à la création par la langue de l'interface ──
      langue_acte: isAr ? 'ar' : 'fr',
    });
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/radiations')} />
        <Title level={4} style={{ margin: 0 }}>Nouvelle demande de radiation</Title>
      </div>

      <Card title="Étape 1 — Recherche du dossier" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={8} align="middle">
          <Col flex="auto">
            <Input
              placeholder="N° analytique (ex: 000013)"
              value={lookupVal}
              onChange={e => setLookupVal(e.target.value)}
              onPressEnter={handleLookup}
            />
          </Col>
          <Col>
            <Button icon={<SearchOutlined />} onClick={handleLookup} loading={lookupLoading}>
              Rechercher
            </Button>
          </Col>
        </Row>
        {lookupError && <Alert type="error" message={lookupError} style={{ marginTop: 8 }} showIcon />}
        {raData && (
          <Alert type="success" style={{ marginTop: 8 }}
            message={
              <><strong>{raData.numero_ra}</strong> — {raData.denomination} ({raData.type_entite})
                {raData.numero_rc && <Text type="secondary"> · RC {raData.numero_rc}</Text>}
              </>
            }
            showIcon />
        )}
      </Card>

      {raData && (
        <Spin spinning={lookupLoading}>
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Card title={isAr ? 'الخطوة 2 — معلومات الطلب' : 'Étape 2 — Informations de la demande'} size="small" style={{ marginBottom: 16, borderLeft: '4px solid #1a4480' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label={isAr ? 'مقدم الطلب' : 'Demandeur'}
                    name="demandeur"
                    rules={[{ required: true, message: isAr ? 'مقدم الطلب إلزامي' : 'Le demandeur est obligatoire' }]}
                    extra={isAr ? 'الشخص الذي يتقدم إلى السجل التجاري' : 'Personne qui se présente au registre du commerce'}
                  >
                    <Input placeholder={isAr ? 'الاسم الكامل لمقدم الطلب' : 'Nom complet du demandeur'} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={isAr ? 'تاريخ ووقت الشطب' : 'Date et heure de l\'acte de radiation'}
                    name="date_acte"
                    initialValue={dayjs()}
                    extra={<span style={{ fontSize: 11, color: '#888' }}>{isAr ? 'الإهداء القانوني للشطب' : 'Horodatage légal de l\'acte'}</span>}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      showTime={{ format: 'HH:mm' }}
                      format="DD/MM/YYYY HH:mm"
                      placeholder={isAr ? 'يي/شش/سسسس سس:دد' : 'JJ/MM/AAAA HH:mm'}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title={isAr ? 'الخطوة 3 — سبب الشطب' : 'Étape 3 — Motif de radiation'} size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label={isAr ? 'السبب' : 'Motif'}
                    name="motif"
                    rules={[{ required: true, message: 'Requis' }]}
                  >
                    <Select options={getMotifOptions(isAr)} placeholder={isAr ? 'اختر السبب' : 'Sélectionner le motif'} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label={isAr ? 'الوصف / التفاصيل' : 'Description / Précisions'} name="description">
                <Input.TextArea rows={3} placeholder={isAr ? 'تفاصيل إضافية حول سبب الشطب…' : 'Détails complémentaires sur le motif de radiation…'} />
              </Form.Item>
            </Card>

            <div style={{ marginBottom: 16 }}>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 8 }}
                message="Une pièce justificative est obligatoire pour toute demande de radiation."
              />
              <PiecesJointesPending
                pendingFiles={pendingFiles}
                onAddPending={(f) => setPendingFiles(prev => [...prev, f])}
                onRemovePending={(uid) => setPendingFiles(prev => prev.filter(p => p.uid !== uid))}
              />
            </div>

            <div style={{ textAlign: 'right' }}>
              <Button onClick={() => navigate('/radiations')} style={{ marginRight: 8 }}>Annuler</Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={saveMut.isPending}
                style={{ background: '#b91c1c' }}
              >
                Soumettre la demande
              </Button>
            </div>
          </Form>
        </Spin>
      )}
    </div>
  );
};

export default FormulaireRadiation;

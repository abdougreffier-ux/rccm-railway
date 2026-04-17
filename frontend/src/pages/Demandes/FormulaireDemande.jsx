import React from 'react';
import { Form, Input, Select, InputNumber, Button, Card, Row, Col, Typography, message, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { demandeAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const FormulaireDemande = () => {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [form]      = Form.useForm();
  const { t, field } = useLanguage();

  const { data: tdData } = useQuery({
    queryKey: ['types-demandes'],
    queryFn:  () => parametrageAPI.typesDemandes().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data) => demandeAPI.create(data),
    onSuccess: () => {
      message.success(t('msg.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      navigate('/demandes');
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const tdOptions = (tdData?.results || tdData || []).map(td => ({ value: td.id, label: field(td, 'libelle') }));

  const typeEntiteOptions = [
    { value: 'PH', label: t('entity.PH_label') },
    { value: 'PM', label: t('entity.PM_label') },
    { value: 'SC', label: t('entity.SC_label') },
  ];

  const canalOptions = [
    { value: 'GUICHET',  label: t('canal.guichet') },
    { value: 'EN_LIGNE', label: t('canal.enLigne') },
  ];

  return (
    <div>
      <Title level={4}>📝 {t('action.newDemande')}</Title>

      <Form form={form} layout="vertical" onFinish={createMut.mutate} size="middle">
        <Row gutter={24}>
          <Col xs={24} md={14}>
            <Card title={t('form.infoDemande')} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="type_entite" label={t('field.typeEntite')} rules={[{ required: true }]}>
                    <Select options={typeEntiteOptions} placeholder={t('placeholder.select')} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="type_demande" label={t('field.typeDemande')} rules={[{ required: true }]}>
                    <Select showSearch options={tdOptions} placeholder={t('placeholder.select')}
                      filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="canal" label={t('field.canal')} rules={[{ required: true }]}>
                    <Select options={canalOptions} placeholder={t('placeholder.select')} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="montant_paye" label={t('field.montantPaye')}>
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="observations" label={t('field.observations')}>
                    <Input.TextArea rows={4} placeholder={t('placeholder.observations')} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        <Space>
          <Button type="primary" htmlType="submit" loading={createMut.isPending} style={{ background: '#1a4480' }}>
            {t('action.createDemande')}
          </Button>
          <Button onClick={() => navigate('/demandes')}>{t('common.cancel')}</Button>
        </Space>
      </Form>
    </div>
  );
};

export default FormulaireDemande;

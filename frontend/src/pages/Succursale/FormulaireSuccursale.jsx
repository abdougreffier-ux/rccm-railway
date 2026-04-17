import React, { useEffect } from 'react';
import { Form, Input, Select, InputNumber, Button, Row, Col, Card, Typography, message, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, pmAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { uppercaseRule } from '../../components/NniInput';

const { Title } = Typography;

const FormulaireSuccursale = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [form]      = Form.useForm();
  const isEdit      = !!id;
  const { t, field, isAr } = useLanguage();

  const { data: existing } = useQuery({
    queryKey: ['succursale', id],
    queryFn:  () => scAPI.get(id).then(r => r.data),
    enabled:  isEdit,
  });

  const { data: pmData }  = useQuery({ queryKey: ['personnes-morales-select'], queryFn: () => pmAPI.list({ page_size: 500 }).then(r => r.data) });
  const { data: locData } = useQuery({ queryKey: ['localites'],                queryFn: () => parametrageAPI.localites().then(r => r.data) });

  useEffect(() => {
    if (existing) form.setFieldsValue({ ...existing });
  }, [existing, form]);

  const saveMut = useMutation({
    mutationFn: (data) => isEdit ? scAPI.update(id, data) : scAPI.create(data),
    onSuccess: () => {
      message.success(isEdit ? t('msg.editSuccess') : t('msg.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['succursales'] });
      navigate('/succursales');
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const pmOptions  = (pmData?.results  || pmData  || []).map(p => ({ value: p.id, label: field(p, 'denomination') }));
  const locOptions = (locData?.results || locData || []).map(l => ({ value: l.id, label: field(l, 'libelle') }));

  return (
    <div>
      <Title level={4}>{isEdit ? t('form.editSC') : t('form.newSC')}</Title>

      <Form form={form} layout="vertical" onFinish={saveMut.mutate} size="middle">
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Card title={t('form.identification')} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item name="denomination" label={t('field.denominationFr')} rules={[{ required: true }, uppercaseRule(isAr)]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="denomination_ar" label={t('field.denominationAr')}>
                    <Input dir="rtl" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="pm_mere" label={t('field.pmMere')}>
                    <Select showSearch options={pmOptions} placeholder={t('placeholder.select')}
                      filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="pays_origine" label={t('field.paysOrigine')} rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title={t('form.capitalCoordonnees')} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={14}>
                  <Form.Item name="capital_affecte" label={t('field.capitalAffecte')}>
                    <InputNumber style={{ width: '100%' }} min={0}
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="devise" label={t('field.devise')}>
                    <Input placeholder="MRU, EUR…" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="siege_social" label={t('field.siegeSocial')}>
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ville" label={t('field.ville')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="localite" label={t('field.localite')}>
                    <Select showSearch options={locOptions} placeholder={t('placeholder.select')}
                      filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="telephone" label={t('field.telephone')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="email" label={t('field.email')}>
                    <Input type="email" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        <Space>
          <Button type="primary" htmlType="submit" loading={saveMut.isPending} style={{ background: '#1a4480' }}>
            {isEdit ? t('action.save') : t('action.createSC')}
          </Button>
          <Button onClick={() => navigate('/succursales')}>{t('common.cancel')}</Button>
        </Space>
      </Form>
    </div>
  );
};

export default FormulaireSuccursale;

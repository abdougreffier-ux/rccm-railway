import React, { useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Row, Col, Card, Typography, message, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { phAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import NniInput, { nniRule, uppercaseRule } from '../../components/NniInput';
import { getCiviliteOptions } from '../../utils/civilite';
import dayjs from 'dayjs';

const { Title } = Typography;

const FormulairePH = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [form]      = Form.useForm();
  const isEdit      = !!id;
  const { t, field, isAr } = useLanguage();

  const { data: existing } = useQuery({
    queryKey: ['ph', id],
    queryFn:  () => phAPI.get(id).then(r => r.data),
    enabled:  isEdit,
  });

  const { data: natData } = useQuery({ queryKey: ['nationalites'], queryFn: () => parametrageAPI.nationalites().then(r => r.data) });
  const { data: locData } = useQuery({ queryKey: ['localites'],    queryFn: () => parametrageAPI.localites().then(r => r.data) });

  useEffect(() => {
    if (existing) {
      form.setFieldsValue({
        ...existing,
        date_naissance: existing.date_naissance ? dayjs(existing.date_naissance) : null,
      });
    }
  }, [existing, form]);

  const saveMut = useMutation({
    mutationFn: (data) => isEdit ? phAPI.update(id, data) : phAPI.create(data),
    onSuccess: () => {
      message.success(isEdit ? t('msg.editSuccess') : t('msg.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['personnes-physiques'] });
      navigate('/personnes-physiques');
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const onFinish = (values) => {
    const data = { ...values, date_naissance: values.date_naissance?.format('YYYY-MM-DD') };
    saveMut.mutate(data);
  };

  const natOptions = (natData?.results || natData || []).map(n => ({ value: n.id, label: field(n, 'libelle') }));
  const locOptions = (locData?.results || locData || []).map(l => ({ value: l.id, label: field(l, 'libelle') }));

  return (
    <div>
      <Title level={4}>{isEdit ? t('form.editPH') : t('form.newPH')}</Title>

      <Form form={form} layout="vertical" onFinish={onFinish} size="middle">
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Card title={t('form.identity')} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="nni" label={t('field.nni')} rules={[nniRule(t)]}>
                    <NniInput />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="sexe" label={t('field.sexe')}>
                    <Select options={[
                      { value: 'M', label: t('sexe.M') },
                      { value: 'F', label: t('sexe.F') },
                    ]} placeholder={t('placeholder.select')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
                    <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="nom" label={t('field.nomFr')} rules={[{ required: true }, uppercaseRule(isAr)]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="prenom" label={t('field.prenom')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="nom_ar" label="الاسم">
                    <Input dir="rtl" placeholder="الاسم بالعربية" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="prenom_ar" label="اللقب">
                    <Input dir="rtl" placeholder="اللقب بالعربية" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="date_naissance" label={t('field.dateNaissance')}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="lieu_naissance" label={t('field.lieuNaissance')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="nationalite" label={t('field.nationalite')} rules={[{ required: true }]}>
                    <Select showSearch options={natOptions} placeholder={t('placeholder.select')}
                      filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="situation_matrimoniale" label={t('field.situationMatrimoniale')}>
                    <Select options={[
                      { value: 'CELIBATAIRE', label: t('sm.celibataire') },
                      { value: 'MARIE',       label: t('sm.marie') },
                      { value: 'DIVORCE',     label: t('sm.divorce') },
                      { value: 'VEUF',        label: t('sm.veuf') },
                    ]} placeholder={t('placeholder.select')} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title={t('form.coordonnees')} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item name="adresse" label={t('field.adresse')}>
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
                <Col span={12}>
                  <Form.Item name="num_carte_identite" label={t('field.numCarteIdentite')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="num_passeport" label={t('field.numPasseport')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="nom_pere" label={t('field.nomPere')} rules={[uppercaseRule(isAr)]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="nom_mere" label={t('field.nomMere')} rules={[uppercaseRule(isAr)]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="profession" label={t('field.profession')}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        <Space>
          <Button type="primary" htmlType="submit" loading={saveMut.isPending} style={{ background: '#1a4480' }}>
            {isEdit ? t('action.savePH') : t('common.new')}
          </Button>
          <Button onClick={() => navigate('/personnes-physiques')}>{t('common.cancel')}</Button>
        </Space>
      </Form>
    </div>
  );
};

export default FormulairePH;

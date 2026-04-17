import React, { useEffect } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Button, Row, Col, Card, Typography, message, Space, Tabs } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pmAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { uppercaseRule } from '../../components/NniInput';
import dayjs from 'dayjs';

const { Title } = Typography;

const FormulairePM = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [form]       = Form.useForm();
  const isEdit       = !!id;
  const { t, field, isAr } = useLanguage();

  const { data: existing } = useQuery({
    queryKey: ['pm', id], queryFn: () => pmAPI.get(id).then(r => r.data), enabled: isEdit,
  });

  const { data: fjData  } = useQuery({ queryKey: ['formes-juridiques'], queryFn: () => parametrageAPI.formesJuridiques({ type_entite: 'PM' }).then(r => r.data) });
  const { data: locData } = useQuery({ queryKey: ['localites'],          queryFn: () => parametrageAPI.localites().then(r => r.data) });

  useEffect(() => {
    if (existing) {
      form.setFieldsValue({
        ...existing,
        date_constitution: existing.date_constitution ? dayjs(existing.date_constitution) : null,
        date_ag: existing.date_ag ? dayjs(existing.date_ag) : null,
      });
    }
  }, [existing, form]);

  const saveMut = useMutation({
    mutationFn: (data) => isEdit ? pmAPI.update(id, data) : pmAPI.create(data),
    onSuccess: () => {
      message.success(isEdit ? t('msg.editSuccess') : t('msg.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['personnes-morales'] });
      navigate('/personnes-morales');
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const onFinish = (values) => {
    saveMut.mutate({
      ...values,
      date_constitution: values.date_constitution?.format('YYYY-MM-DD'),
      date_ag: values.date_ag?.format('YYYY-MM-DD'),
    });
  };

  const fjOptions  = (fjData?.results  || fjData  || []).map(f => ({ value: f.id, label: isAr ? field(f, 'libelle') : `${f.code} – ${f.libelle_fr}` }));
  const locOptions = (locData?.results || locData || []).map(l => ({ value: l.id, label: field(l, 'libelle') }));

  const tabItems = [
    {
      key: '1', label: t('form.infoGenerales'),
      children: (
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item name="denomination" label={t('field.denominationFr')} rules={[{ required: true }, uppercaseRule(isAr)]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sigle" label={t('field.sigle')}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="denomination_ar" label={t('field.denominationAr')}>
              <Input dir="rtl" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="forme_juridique" label={t('field.formeJuridique')} rules={[{ required: true }]}>
              <Select showSearch options={fjOptions} placeholder={t('placeholder.select')}
                filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="capital_social" label={t('field.capitalSocial')}>
              <InputNumber min={0} style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item name="devise_capital" label={t('field.devise')} initialValue="MRU">
              <Select options={[
                { value: 'MRU', label: isAr ? 'أوقية موريتانية'  : 'MRU – Ouguiya mauritanien' },
                { value: 'EUR', label: isAr ? 'يورو'              : 'EUR – Euro' },
                { value: 'USD', label: isAr ? 'دولار أمريكي'      : 'USD – Dollar américain' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="duree_societe" label={t('field.duree')}>
              <InputNumber min={1} max={99} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="date_constitution" label={t('field.dateConstitution')}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="date_ag" label={t('field.dateAG')}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
        </Row>
      )
    },
    {
      key: '2', label: t('form.siegeCoordonnees'),
      children: (
        <Row gutter={16}>
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
          <Col span={8}><Form.Item name="telephone" label={t('field.telephone')}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="fax" label={t('field.fax')}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="bp" label={t('field.bp')}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="email" label={t('field.email')}><Input type="email" /></Form.Item></Col>
          <Col span={12}><Form.Item name="site_web" label={t('field.siteWeb')}><Input /></Form.Item></Col>
        </Row>
      )
    }
  ];

  return (
    <div>
      <Title level={4}>{isEdit ? t('form.editPM') : t('form.newPM')}</Title>
      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Tabs items={tabItems} />
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={saveMut.isPending} style={{ background: '#1a4480' }}>
              {isEdit ? t('action.save') : t('common.new')}
            </Button>
            <Button onClick={() => navigate('/personnes-morales')}>{t('common.cancel')}</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};

export default FormulairePM;

import React, { useState } from 'react';
import { Form, Select, Steps, Button, Space, Card, Typography, message, DatePicker, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { registreAPI, phAPI, pmAPI, scAPI, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;

const FormulaireRA = () => {
  const [step,       setStep]       = useState(0);
  const [typeEntite, setTypeEntite] = useState('');
  const [form]       = Form.useForm();
  const navigate     = useNavigate();
  const { t, field } = useLanguage();

  const { data: phData } = useQuery({ queryKey: ['ph-search'],  queryFn: () => phAPI.list({ limit: 200 }).then(r => r.data), enabled: typeEntite === 'PH' });
  const { data: pmData } = useQuery({ queryKey: ['pm-search'],  queryFn: () => pmAPI.list({ limit: 200 }).then(r => r.data), enabled: typeEntite === 'PM' });
  const { data: scData } = useQuery({ queryKey: ['sc-search'],  queryFn: () => scAPI.list({ limit: 200 }).then(r => r.data), enabled: typeEntite === 'SC' });
  const { data: locData} = useQuery({ queryKey: ['localites'],  queryFn: () => parametrageAPI.localites().then(r => r.data) });

  const createMut = useMutation({
    mutationFn: (data) => registreAPI.createRA(data),
    onSuccess: (r) => { message.success(t('msg.createSuccess')); navigate(`/registres/analytique/${r.data.id}`); },
    onError:   (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const onFinish = (values) => {
    createMut.mutate({
      ...values,
      date_immatriculation: values.date_immatriculation?.format('YYYY-MM-DD'),
    });
  };

  const phOptions  = (phData?.results || []).map(p => ({ value: p.id, label: `${field(p,'nom') || p.nom_complet} ${p.nni ? `(${p.nni})` : ''}` }));
  const pmOptions  = (pmData?.results || []).map(p => ({ value: p.id, label: field(p, 'denomination') || p.denomination }));
  const scOptions  = (scData?.results || []).map(s => ({ value: s.id, label: field(s, 'denomination') || s.denomination }));
  const locOptions = (locData?.results || locData || []).map(l => ({ value: l.id, label: field(l, 'libelle') }));

  const typeEntiteOptions = [
    { value: 'PH', label: `👤 ${t('entity.PH')}` },
    { value: 'PM', label: `🏢 ${t('entity.PM')}` },
    { value: 'SC', label: `🌿 ${t('entity.SC')}` },
  ];

  return (
    <div>
      <Title level={4}>📋 {t('form.newRA')}</Title>
      <Card>
        <Steps current={step} style={{ marginBottom: 24 }} items={[
          { title: t('form.step.typeEntite') },
          { title: t('form.step.selectionEntite') },
          { title: t('form.step.infoRC') },
        ]} />

        <Form form={form} layout="vertical" onFinish={onFinish}>
          {step === 0 && (
            <Form.Item name="type_entite" label={t('field.typeEntite')} rules={[{ required: true }]}>
              <Select
                size="large"
                style={{ width: 320 }}
                onChange={v => setTypeEntite(v)}
                options={typeEntiteOptions}
              />
            </Form.Item>
          )}

          {step === 1 && (
            <>
              {typeEntite === 'PH' && (
                <Form.Item name="ph" label={t('form.selectPH')} rules={[{ required: true }]}>
                  <Select showSearch options={phOptions} style={{ width: 400 }} placeholder={t('placeholder.typeToSearch')}
                    filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                </Form.Item>
              )}
              {typeEntite === 'PM' && (
                <Form.Item name="pm" label={t('form.selectPM')} rules={[{ required: true }]}>
                  <Select showSearch options={pmOptions} style={{ width: 400 }} placeholder={t('placeholder.typeToSearch')}
                    filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                </Form.Item>
              )}
              {typeEntite === 'SC' && (
                <Form.Item name="sc" label={t('form.selectSC')} rules={[{ required: true }]}>
                  <Select showSearch options={scOptions} style={{ width: 400 }} placeholder={t('placeholder.typeToSearch')}
                    filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
                </Form.Item>
              )}
              <Button type="link" onClick={() => {
                const path = typeEntite === 'PH' ? '/personnes-physiques/nouveau' : typeEntite === 'PM' ? '/personnes-morales/nouveau' : '/succursales/nouveau';
                navigate(path);
              }}>
                {typeEntite === 'PH' ? t('form.newEntityLink.PH') : typeEntite === 'PM' ? t('form.newEntityLink.PM') : t('form.newEntityLink.SC')}
              </Button>
            </>
          )}

          {step === 2 && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Form.Item name="numero_ra" label={t('form.autoGenerate')}>
                <Input style={{ width: 300 }} />
              </Form.Item>
              <Form.Item name="localite" label={t('form.greffe')} rules={[{ required: true }]}>
                <Select showSearch options={locOptions} style={{ width: 300 }} placeholder={t('placeholder.select')}
                  filterOption={(v, o) => o.label.toLowerCase().includes(v.toLowerCase())} />
              </Form.Item>
              <Form.Item name="date_immatriculation" label={t('field.dateImmatriculation')}>
                <DatePicker format="DD/MM/YYYY" />
              </Form.Item>
              <Form.Item name="observations" label={t('field.observations')}>
                <Input.TextArea rows={3} />
              </Form.Item>
            </Space>
          )}

          <div style={{ marginTop: 24 }}>
            <Space>
              {step > 0 && <Button onClick={() => setStep(s => s - 1)}>{t('action.precedent')}</Button>}
              {step < 2 && (
                <Button type="primary" onClick={() => {
                  form.validateFields().then(() => setStep(s => s + 1));
                }} style={{ background: '#1a4480' }} disabled={step === 0 && !typeEntite}>
                  {t('action.suivant')}
                </Button>
              )}
              {step === 2 && (
                <Button type="primary" htmlType="submit" loading={createMut.isPending} style={{ background: '#2e7d32' }}>
                  {t('action.createImmat')}
                </Button>
              )}
              <Button onClick={() => navigate('/registres/analytique')}>{t('common.cancel')}</Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default FormulaireRA;

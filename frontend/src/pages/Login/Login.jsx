import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const { t, isAr, lang, changeLang } = useLanguage();

  const onFinish = async ({ login: lgn, password }) => {
    setLoading(true);
    setError('');
    try {
      await login(lgn, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || (isAr ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : 'Login ou mot de passe incorrect.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a4480 0%, #2e7d32 100%)',
    }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 48 }}>🏛️</div>
            <Title level={3} style={{ color: '#1a4480', margin: 0 }}>{t('app.title')}</Title>
            <Text type="secondary">{isAr ? 'الجمهورية الإسلامية الموريتانية' : 'République Islamique de Mauritanie'}</Text>
          </div>

          {error && <Alert message={error} type="error" showIcon />}

          <Form name="login" onFinish={onFinish} size="large" layout="vertical">
            <Form.Item name="login" rules={[{ required: true, message: isAr ? 'أدخل اسم المستخدم' : 'Entrez votre login' }]}>
              <Input prefix={<UserOutlined />} placeholder={t('auth.username')} autoFocus />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: isAr ? 'أدخل كلمة المرور' : 'Entrez votre mot de passe' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password')} />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}
                style={{ background: '#1a4480', height: 44 }}>
                {t('auth.login')}
              </Button>
            </Form.Item>
          </Form>

          {/* Bascule de langue sur la page de connexion */}
          <Button type="text" size="small" onClick={() => changeLang(isAr ? 'fr' : 'ar')}
            style={{ color: '#999' }}>
            {isAr ? 'Français' : 'العربية'}
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Login;

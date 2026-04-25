/**
 * AccessDenied — composant d'erreur d'accès bilingue FR/AR
 * =========================================================
 * Utilisé pour :
 *   - 401 : session expirée → bouton « Reconnexion »
 *   - 403 : accès interdit → bouton « Retour à mon espace »
 *   - null : erreur de chargement générique → bouton « Réessayer » + « Retour »
 *
 * Import :
 *   import AccessDenied from 'components/Common/AccessDenied';
 *   <AccessDenied status={error?.response?.status} onRetry={refetch} />
 */

import React from 'react';
import { Button, Space, Typography } from 'antd';
import {
  LockOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getLanding }  from '../../config/roles';

const { Title, Text } = Typography;

// ── Contenu par code HTTP ─────────────────────────────────────────────────────
const CONFIG = {
  401: {
    icon:    <ClockCircleOutlined style={{ fontSize: 56, color: '#faad14' }} />,
    titleFr: '401 – Session expirée',
    titleAr: '401 – انتهت الجلسة',
    msgFr:   'Votre session a expiré. Veuillez vous identifier à nouveau.',
    msgAr:   'انتهت صلاحية جلستك. يرجى تسجيل الدخول مجدداً.',
    ctaFr:   'Se reconnecter',
    ctaAr:   'تسجيل الدخول',
    ctaType: 'primary',
  },
  403: {
    icon:    <LockOutlined style={{ fontSize: 56, color: '#ff4d4f' }} />,
    titleFr: '403 – Accès refusé',
    titleAr: '403 – الوصول مرفوض',
    msgFr:   "Vous ne disposez pas des droits nécessaires pour accéder à cette page.",
    msgAr:   'ليس لديك الصلاحيات اللازمة للوصول إلى هذه الصفحة.',
    ctaFr:   'Retour à mon espace de travail',
    ctaAr:   'العودة إلى مساحة عملي',
    ctaType: 'default',
  },
  default: {
    icon:    <WarningOutlined style={{ fontSize: 56, color: '#ff7a45' }} />,
    titleFr: 'Impossible de charger',
    titleAr: 'تعذّر التحميل',
    msgFr:   'La ressource est temporairement indisponible. Vérifiez votre connexion ou réessayez.',
    msgAr:   'المورد غير متاح مؤقتاً. تحقق من اتصالك أو حاول مجدداً.',
    ctaFr:   null,   // bouton "Réessayer" + "Retour" gérés séparément
    ctaAr:   null,
    ctaType: 'primary',
  },
};

// ── Composant ─────────────────────────────────────────────────────────────────

/**
 * @param {number|null}   [status]   — code HTTP (401, 403, ou null pour erreur générique)
 * @param {function|null} [onRetry]  — callback « Réessayer » (erreur générique uniquement)
 * @param {string}        [style]    — 'page' (centré plein-contenu) ou 'inline' (compact)
 */
const AccessDenied = ({ status = null, onRetry = null, style: displayStyle = 'page' }) => {
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const { isAr }       = useLanguage();
  const cfg            = CONFIG[status] ?? CONFIG.default;
  const isGeneric      = !status || (status !== 401 && status !== 403);

  const handleCta = () => {
    if (status === 401) {
      navigate('/login', { replace: true });
    } else {
      navigate(getLanding(user), { replace: true });
    }
  };

  const containerStyle = displayStyle === 'inline'
    ? { padding: '24px 16px', textAlign: isAr ? 'right' : 'left' }
    : {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
        minHeight: 320,
      };

  return (
    <div style={containerStyle} dir={isAr ? 'rtl' : 'ltr'}>
      <div style={{ marginBottom: 16 }}>{cfg.icon}</div>

      <Title level={4} style={{ margin: '0 0 8px' }}>
        {isAr ? cfg.titleAr : cfg.titleFr}
      </Title>

      <Text type="secondary" style={{ display: 'block', maxWidth: 480, marginBottom: 24 }}>
        {isAr ? cfg.msgAr : cfg.msgFr}
      </Text>

      <Space wrap>
        {/* Bouton principal : reconnexion / retour landing */}
        {!isGeneric && (
          <Button type={cfg.ctaType} onClick={handleCta}>
            {isAr ? cfg.ctaAr : cfg.ctaFr}
          </Button>
        )}

        {/* Erreur générique : Réessayer + Retour */}
        {isGeneric && onRetry && (
          <Button type="primary" onClick={onRetry}>
            {isAr ? 'إعادة المحاولة' : 'Réessayer'}
          </Button>
        )}
        {isGeneric && (
          <Button onClick={() => navigate(getLanding(user), { replace: true })}>
            {isAr ? 'العودة إلى مساحة عملي' : 'Retour à mon espace'}
          </Button>
        )}
      </Space>
    </div>
  );
};

export default AccessDenied;

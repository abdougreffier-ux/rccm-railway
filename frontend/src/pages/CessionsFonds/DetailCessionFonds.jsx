import React, { useState } from 'react';
import {
  Card, Button, Space, Tag, Typography, Descriptions, Divider,
  Modal, Input, Alert, Spin, Row, Col, message, Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, CloseOutlined, RollbackOutlined,
  SendOutlined, PrinterOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cessionsFondsAPI, openPDF } from '../../api/api';
import PiecesJointesCard from '../../components/PiecesJointesCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUT_CONFIG = {
  BROUILLON:       { color: 'default',    label: 'Brouillon' },
  EN_INSTANCE:     { color: 'processing', label: 'En instance de validation' },
  RETOURNE:        { color: 'warning',    label: 'Retourné' },
  VALIDE:          { color: 'success',    label: 'Validé' },
  ANNULE:          { color: 'error',      label: 'Annulé' },
  ANNULE_GREFFIER: { color: 'error',      label: 'Annulé (greffier)' },
};

const TYPE_ACTE_LABELS = { NOTARIE: 'Acte notarié', SEING_PRIVE: 'Acte sous seing privé' };

const DetailCessionFonds = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { isAr, lang } = useLanguage();
  const { hasRole } = useAuth();
  const isGreffier  = hasRole('GREFFIER');

  const [retourModal,  setRetourModal]  = useState(false);
  const [retourObs,    setRetourObs]    = useState('');
  const [validerModal, setValiderModal] = useState(false);
  const [validerObs,   setValiderObs]   = useState('');

  const { data: cf, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cession-fonds', id],
    queryFn:  () => cessionsFondsAPI.get(id).then(r => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cession-fonds', id] });
    queryClient.invalidateQueries({ queryKey: ['cessions-fonds'] });
  };

  const soumMut = useMutation({
    mutationFn: () => cessionsFondsAPI.soumettre(id),
    onSuccess: () => { message.success('Soumis au greffier.'); invalidate(); },
    onError:   (e) => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  const annulMut = useMutation({
    mutationFn: () => cessionsFondsAPI.annuler(id),
    onSuccess: () => { message.success('Cession annulée.'); invalidate(); },
    onError:   (e) => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  const annValMut = useMutation({
    mutationFn: () => cessionsFondsAPI.annulerValide(id),
    onSuccess: () => { message.success('Cession annulée et titulaire restauré.'); invalidate(); },
    onError:   (e) => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  const retourMut = useMutation({
    mutationFn: () => cessionsFondsAPI.retourner(id, { observations: retourObs }),
    onSuccess: () => {
      message.success("Dossier retourné à l'agent.");
      setRetourModal(false);
      invalidate();
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  const validMut = useMutation({
    mutationFn: () => cessionsFondsAPI.valider(id, { observations: validerObs }),
    onSuccess: () => {
      message.success('Cession de fonds validée.');
      setValiderModal(false);
      invalidate();
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!cf)       return <AccessDenied onRetry={refetch} style="inline" />;

  const statut = cf.statut || '';
  const snap   = cf.snapshot_cedant || {};
  const cess   = cf.cessionnaire_data || {};

  const cedantNom = snap.nom
    ? `${snap.prenom || ''} ${snap.nom}`.trim()
    : (cf.cedant_nom || '—');
  const cessNom = `${cess.prenom || ''} ${cess.nom || ''}`.trim() || cf.cessionnaire_nom || '—';

  const printCert = () => {
    openPDF(cessionsFondsAPI.certificat(id));
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/cessions-fonds')} />
          <Title level={4} style={{ margin: 0 }}>
            {isAr ? 'تنازل عن المحل التجاري' : 'Cession de fonds de commerce'}
            <Tag style={{ marginLeft: 10 }} color={STATUT_CONFIG[statut]?.color}>
              {STATUT_CONFIG[statut]?.label || statut}
            </Tag>
          </Title>
        </Space>

        {/* Boutons d'action */}
        <Space wrap>
          {/* Agent : soumettre depuis BROUILLON */}
          {!isGreffier && statut === 'BROUILLON' && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => soumMut.mutate()}
              loading={soumMut.isPending}
              style={{ background: '#1a4480' }}
            >
              {isAr ? 'إرسال إلى كاتب الضبط' : 'Soumettre au greffier'}
            </Button>
          )}

          {/* Agent : modifier + resoumettre depuis RETOURNE */}
          {!isGreffier && statut === 'RETOURNE' && (
            <>
              <Button onClick={() => navigate(`/cessions-fonds/${id}/modifier`)}>
                {isAr ? 'تعديل' : 'Modifier'}
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => soumMut.mutate()}
                loading={soumMut.isPending}
                style={{ background: '#1a4480' }}
              >
                {isAr ? 'إعادة الإرسال' : 'Resoumettre'}
              </Button>
            </>
          )}

          {/* Agent : annuler depuis BROUILLON ou RETOURNE */}
          {!isGreffier && ['BROUILLON', 'RETOURNE'].includes(statut) && (
            <Button danger onClick={() => annulMut.mutate()} loading={annulMut.isPending}>
              {isAr ? 'إلغاء' : 'Annuler'}
            </Button>
          )}

          {/* Greffier : retourner / valider depuis EN_INSTANCE */}
          {isGreffier && statut === 'EN_INSTANCE' && (
            <>
              <Button
                icon={<RollbackOutlined />}
                onClick={() => { setRetourObs(''); setRetourModal(true); }}
              >
                {isAr ? 'إعادة إلى الوكيل' : 'Retourner'}
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => { setValiderObs(''); setValiderModal(true); }}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                {isAr ? 'مصادقة' : 'Valider'}
              </Button>
            </>
          )}

          {/* Greffier : annuler une validation */}
          {isGreffier && statut === 'VALIDE' && cf.can_annuler_valide && (
            <Button danger onClick={() => annValMut.mutate()} loading={annValMut.isPending}>
              {isAr ? 'إلغاء المصادقة' : 'Annuler la validation'}
            </Button>
          )}

          {/* Certificat (si validé) */}
          {statut === 'VALIDE' && (
            <Tooltip title={isAr ? 'طباعة الشهادة' : 'Imprimer le certificat'}>
              <Button icon={<PrinterOutlined />} onClick={printCert}>
                {isAr ? 'الشهادة' : 'Certificat'}
              </Button>
            </Tooltip>
          )}
        </Space>
      </div>

      {/* Observations si retourné */}
      {statut === 'RETOURNE' && cf.observations && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={isAr ? 'ملاحظات كاتب الضبط' : 'Observations du greffier'}
          description={cf.observations}
        />
      )}

      {/* Informations de référence */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={isAr ? 'الرقم المرجعي' : 'N° de référence'}>
            <Text strong>{cf.numero_cession_fonds}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'الحالة' : 'Statut'}>
            <Tag color={STATUT_CONFIG[statut]?.color}>{STATUT_CONFIG[statut]?.label || statut}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'تاريخ الإنشاء' : 'Créé le'}>
            {cf.created_at ? new Date(cf.created_at).toLocaleDateString('fr-FR') : '—'}
          </Descriptions.Item>
          {cf.demandeur && (
            <Descriptions.Item label={isAr ? 'مُقدِّم الطلب' : 'Demandeur'}>
              {cf.demandeur}
            </Descriptions.Item>
          )}
          <Descriptions.Item label={isAr ? 'المنشئ' : 'Créé par'}>
            {cf.created_by_nom || '—'}
          </Descriptions.Item>
          {cf.validated_at && (
            <Descriptions.Item label={isAr ? 'تاريخ المصادقة' : 'Validé le'}>
              {new Date(cf.validated_at).toLocaleDateString('fr-FR')}
            </Descriptions.Item>
          )}
          {cf.validated_by_nom && (
            <Descriptions.Item label={isAr ? 'مصادَق من' : 'Validé par'}>
              {cf.validated_by_nom}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Section : Identification entreprise */}
      <Card
        size="small"
        style={{ marginBottom: 12, borderLeft: '4px solid #1a4480' }}
        title={
          <Text strong style={{ color: '#1a4480' }}>
            {isAr ? 'المنشأة التجارية' : 'Entreprise (fonds de commerce)'}
          </Text>
        }
      >
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={isAr ? 'الرقم التحليلي' : 'N° Analytique'}>
            {cf.ra_numero}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'التسمية' : 'Dénomination'}>
            {cf.ra_denomination}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Section : Cédant (ancien titulaire) */}
      <Card
        size="small"
        style={{ marginBottom: 12, borderLeft: '4px solid #ff7875' }}
        title={
          <Text strong style={{ color: '#ff7875' }}>
            {isAr ? 'المتنازِل (الشخص السابق)' : 'Cédant — Ancien titulaire'}
          </Text>
        }
      >
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={isAr ? 'الاسم الكامل' : 'Nom et prénoms'}>
            {cedantNom}
          </Descriptions.Item>
          {snap.nationalite && (
            <Descriptions.Item label={isAr ? 'الجنسية' : 'Nationalité'}>
              {snap.nationalite}
            </Descriptions.Item>
          )}
          {snap.nni && (
            <Descriptions.Item label="NNI">{snap.nni}</Descriptions.Item>
          )}
          {snap.date_naissance && (
            <Descriptions.Item label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}>
              {snap.date_naissance}
            </Descriptions.Item>
          )}
          {snap.adresse && (
            <Descriptions.Item label={isAr ? 'العنوان' : 'Adresse'}>
              {snap.adresse}
            </Descriptions.Item>
          )}
          {snap.telephone && (
            <Descriptions.Item label={isAr ? 'الهاتف' : 'Téléphone'}>
              {snap.telephone}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Section : Cessionnaire (nouveau titulaire) */}
      <Card
        size="small"
        style={{ marginBottom: 12, borderLeft: '4px solid #52c41a' }}
        title={
          <Text strong style={{ color: '#52c41a' }}>
            {isAr ? 'المتنازَل إليه (الشخص الجديد)' : 'Cessionnaire — Nouveau titulaire'}
          </Text>
        }
      >
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={isAr ? 'الاسم الكامل' : 'Nom et prénoms'}>
            {cessNom}
          </Descriptions.Item>
          {cess.nationalite_id && (
            <Descriptions.Item label={isAr ? 'الجنسية' : 'Nationalité'}>
              {cess.nationalite_id}
            </Descriptions.Item>
          )}
          {(cess.nni || cess.num_passeport) && (
            <Descriptions.Item label={cess.nni ? 'NNI' : (isAr ? 'جواز السفر' : 'Passeport')}>
              {cess.nni || cess.num_passeport}
            </Descriptions.Item>
          )}
          {cess.date_naissance && (
            <Descriptions.Item label={isAr ? 'تاريخ الميلاد' : 'Date de naissance'}>
              {cess.date_naissance}
            </Descriptions.Item>
          )}
          {cess.lieu_naissance && (
            <Descriptions.Item label={isAr ? 'مكان الميلاد' : 'Lieu de naissance'}>
              {cess.lieu_naissance}
            </Descriptions.Item>
          )}
          {cess.adresse && (
            <Descriptions.Item label={isAr ? 'العنوان' : 'Adresse'}>
              {cess.adresse}
            </Descriptions.Item>
          )}
          {cess.telephone && (
            <Descriptions.Item label={isAr ? 'الهاتف' : 'Téléphone'}>
              {cess.telephone}
            </Descriptions.Item>
          )}
          {cess.email && (
            <Descriptions.Item label="E-mail">{cess.email}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Section : Informations de la cession */}
      <Card
        size="small"
        style={{ marginBottom: 12, borderLeft: '4px solid #faad14' }}
        title={
          <Text strong style={{ color: '#faad14' }}>
            {isAr ? 'معلومات التنازل' : 'Informations de la cession'}
          </Text>
        }
      >
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={isAr ? 'تاريخ التنازل' : 'Date de cession'}>
            {cf.date_cession || '—'}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'نوع العقد' : "Type d'acte"}>
            {TYPE_ACTE_LABELS[cf.type_acte] || cf.type_acte || '—'}
          </Descriptions.Item>
          {cf.observations && (
            <Descriptions.Item label={isAr ? 'ملاحظات' : 'Observations'} span={2}>
              {cf.observations}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Historique des corrections */}
      {cf.corrections && cf.corrections.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Text strong>
              {isAr ? 'سجل التصحيحات' : 'Historique des corrections'}
            </Text>
          }
        >
          {cf.corrections.map((c, i) => (
            <Alert
              key={i}
              type="info"
              style={{ marginBottom: 6 }}
              message={
                <Text>
                  {new Date(c.date).toLocaleDateString('fr-FR')} — {c.user}
                  {c.observations && <> : {c.observations}</>}
                </Text>
              }
            />
          ))}
        </Card>
      )}

      {/* Pièces jointes */}
      <div style={{ marginBottom: 12 }}>
        <PiecesJointesCard
          entityType="cession_fonds"
          entityId={Number(id)}
          readOnly={statut === 'VALIDE' || statut === 'ANNULE' || statut === 'ANNULE_GREFFIER'}
        />
      </div>

      {/* Modal : Retourner le dossier */}
      <Modal
        title={isAr ? 'إعادة الملف إلى الوكيل' : 'Retourner le dossier'}
        open={retourModal}
        onCancel={() => setRetourModal(false)}
        onOk={() => retourMut.mutate()}
        confirmLoading={retourMut.isPending}
        okText={isAr ? 'إرسال' : 'Confirmer'}
      >
        <TextArea
          rows={3}
          value={retourObs}
          onChange={e => setRetourObs(e.target.value)}
          placeholder={isAr ? 'سبب الإعادة...' : 'Motif du retour...'}
        />
      </Modal>

      {/* Modal : Valider la cession */}
      <Modal
        title={isAr ? 'مصادقة على التنازل' : 'Valider la cession de fonds'}
        open={validerModal}
        onCancel={() => setValiderModal(false)}
        onOk={() => validMut.mutate()}
        confirmLoading={validMut.isPending}
        okText={isAr ? 'مصادقة' : 'Confirmer la validation'}
        okButtonProps={{ style: { background: '#52c41a', borderColor: '#52c41a' } }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            isAr
              ? `سيتم استبدال المتنازِل ${cedantNom} بالمتنازَل إليه ${cessNom}.`
              : `Le cédant ${cedantNom} sera remplacé par le cessionnaire ${cessNom}.`
          }
        />
        <TextArea
          rows={2}
          value={validerObs}
          onChange={e => setValiderObs(e.target.value)}
          placeholder={isAr ? 'ملاحظات (اختيارية)' : 'Observations (facultatif)'}
        />
      </Modal>
    </div>
  );
};

export default DetailCessionFonds;

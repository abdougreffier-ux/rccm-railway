import React, { useState, useEffect } from 'react';
import {
  Form, Input, InputNumber, Button, Card, Row, Col,
  Select, DatePicker, Steps, Typography, Alert, message,
  Divider, Radio, Tag, Space,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { historiqueAPI, parametrageAPI, documentAPI } from '../../api/api';
import { PiecesJointesPending } from '../../components/PiecesJointesCard';
import NniInput, { nniRule, uppercaseRule } from '../../components/NniInput';
import { useLanguage } from '../../contexts/LanguageContext';
import { getCiviliteOptions } from '../../utils/civilite';

const { Title, Text } = Typography;

// Helpers décimaux bilingues (FR virgule ↔ interne point)
const pctFormatter = v =>
  (v !== undefined && v !== null && v !== '') ? String(v).replace('.', ',') : '';
const pctParser = v => {
  if (!v) return undefined;
  const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
};

// ── Libellé de champ inline (hors antd Form.Item) ────────────────────────────
const FL = ({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 3 }}>{children}</div>
);

// Retourne true si la valeur contient des minuscules (validation MAJUSCULES, FR seulement)
const hasLowercase = (val, isAr) => !isAr && val && val !== val.toUpperCase();
const UppercaseError = ({ show }) => show
  ? <div style={{ color: '#ff4d4f', fontSize: 11, marginTop: 2 }}>Saisir en MAJUSCULES.</div>
  : null;

// ── Carte Associé (PH ou PM, inline-editable) ─────────────────────────────────
const AssocieCard = ({ assoc, idx, nationalites, onChange, onDelete, t, isAr }) => {
  const isPH = (assoc.type || 'PH') !== 'PM';
  const u = (field, val) => onChange(idx, { ...assoc, [field]: val });

  const headerTitle = isPH
    ? [assoc.nom, assoc.prenom].filter(Boolean).join(' ') || `${isAr ? t('hist.block.associes') : 'Associé'} ${idx + 1}`
    : assoc.denomination || `${isAr ? t('hist.block.associes') : 'Associé'} ${idx + 1}`;

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderColor: isPH ? '#1a4480' : '#389e0d' }}
      title={
        <Space>
          <Select
            size="small"
            value={assoc.type || 'PH'}
            style={{ width: 160 }}
            onChange={v => onChange(idx, {
              _key: assoc._key,
              type: v,
              nationalite_id: null,
              part_sociale: assoc.part_sociale || 0,
            })}
            options={[
              { value: 'PH', label: isAr ? t('entity.ph') : 'Personne physique' },
              { value: 'PM', label: isAr ? t('entity.pm') : 'Personne morale' },
            ]}
          />
          <Text strong style={{ color: isPH ? '#1a4480' : '#389e0d' }}>{headerTitle}</Text>
          {(assoc.part_sociale || 0) > 0 && (
            <Tag color={isPH ? 'blue' : 'green'}>{assoc.part_sociale}%</Tag>
          )}
        </Space>
      }
      extra={
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(idx)} />
      }
    >
      {isPH ? (
        <>
          <Row gutter={8}>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.nom') : 'Nom'}</FL>
              <Input size="small" value={assoc.nom || ''} onChange={e => u('nom', e.target.value)}
                status={hasLowercase(assoc.nom, isAr) ? 'error' : ''} />
              <UppercaseError show={hasLowercase(assoc.nom, isAr)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.prenom') : 'Prénom'}</FL>
              <Input size="small" value={assoc.prenom || ''} onChange={e => u('prenom', e.target.value)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.nni') : 'NNI'}</FL>
              <NniInput size="small" value={assoc.nni || ''} onChange={e => u('nni', e.target.value)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.passeport') : 'N° Passeport'}</FL>
              <Input size="small" value={assoc.num_passeport || ''} onChange={e => u('num_passeport', e.target.value)} />
            </Col>
          </Row>
          <Row gutter={8} style={{ marginTop: 6 }}>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.dateNaissance') : 'Date de naissance'}</FL>
              <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
                value={assoc.date_naissance ? dayjs(assoc.date_naissance) : null}
                onChange={d => u('date_naissance', d ? d.format('YYYY-MM-DD') : null)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.lieuNaissance') : 'Lieu de naissance'}</FL>
              <Input size="small" value={assoc.lieu_naissance || ''} onChange={e => u('lieu_naissance', e.target.value)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.telephone') : 'Téléphone'}</FL>
              <Input size="small" value={assoc.telephone || ''} onChange={e => u('telephone', e.target.value)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.domicile') : 'Domicile'}</FL>
              <Input size="small" value={assoc.domicile || ''} onChange={e => u('domicile', e.target.value)} />
            </Col>
          </Row>
          <Row gutter={8} style={{ marginTop: 6 }}>
            <Col span={10}>
              <FL>{isAr ? t('hist.form.nationalite') : 'Nationalité'}</FL>
              <Select size="small" style={{ width: '100%' }}
                value={assoc.nationalite_id || undefined} allowClear showSearch
                options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
                onChange={v => u('nationalite_id', v || null)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? t('hist.form.partSociale') : 'Part sociale (%)'}</FL>
              <InputNumber size="small" style={{ width: '100%' }}
                value={assoc.part_sociale || 0} min={0} max={100} step={0.01} precision={2}
                formatter={pctFormatter} parser={pctParser}
                onChange={v => u('part_sociale', v ?? 0)} />
            </Col>
          </Row>
        </>
      ) : (
        <>
          <Row gutter={8}>
            <Col span={8}>
              <FL>{isAr ? t('hist.form.denomination') : 'Dénomination'}</FL>
              <Input size="small" value={assoc.denomination || ''} onChange={e => u('denomination', e.target.value)} />
            </Col>
            <Col span={8}>
              <FL>{isAr ? t('hist.form.numRC') : 'N° RC'}</FL>
              <Input size="small" value={assoc.numero_rc || ''} onChange={e => u('numero_rc', e.target.value)} />
            </Col>
            <Col span={8}>
              <FL>{isAr ? t('hist.form.siege') : 'Siège social'}</FL>
              <Input size="small" value={assoc.siege_social || ''} onChange={e => u('siege_social', e.target.value)} />
            </Col>
          </Row>
          <Row gutter={8} style={{ marginTop: 6 }}>
            <Col span={8}>
              <FL>{isAr ? t('hist.form.dateImmat') : "Date d'immatriculation"}</FL>
              <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
                value={assoc.date_immatriculation ? dayjs(assoc.date_immatriculation) : null}
                onChange={d => u('date_immatriculation', d ? d.format('YYYY-MM-DD') : null)} />
            </Col>
            <Col span={8}>
              <FL>{isAr ? t('hist.form.nationalite') : 'Nationalité'}</FL>
              <Select size="small" style={{ width: '100%' }}
                value={assoc.nationalite_id || undefined} allowClear showSearch
                options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
                onChange={v => u('nationalite_id', v || null)} />
            </Col>
            <Col span={4}>
              <FL>{isAr ? t('hist.form.partSociale') : 'Part sociale (%)'}</FL>
              <InputNumber size="small" style={{ width: '100%' }}
                value={assoc.part_sociale || 0} min={0} max={100} step={0.01} precision={2}
                formatter={pctFormatter} parser={pctParser}
                onChange={v => u('part_sociale', v ?? 0)} />
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
};

// ── Carte Gérant (toujours PH) ────────────────────────────────────────────────
const GerantCard = ({ gerant, idx, nationalites, fonctions, onChange, onDelete, t, isAr }) => {
  const u = (field, val) => onChange(idx, { ...gerant, [field]: val });
  const title = [gerant.nom, gerant.prenom].filter(Boolean).join(' ') || `${isAr ? t('hist.block.gerants') : 'Gérant'} ${idx + 1}`;

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderColor: '#722ed1' }}
      title={<Text strong style={{ color: '#722ed1' }}>{title}</Text>}
      extra={<Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(idx)} />}
    >
      <Row gutter={8}>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.nom') : 'Nom'}</FL>
          <Input size="small" value={gerant.nom || ''} onChange={e => u('nom', e.target.value)}
            status={hasLowercase(gerant.nom, isAr) ? 'error' : ''} />
          <UppercaseError show={hasLowercase(gerant.nom, isAr)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.prenom') : 'Prénom'}</FL>
          <Input size="small" value={gerant.prenom || ''} onChange={e => u('prenom', e.target.value)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.nni') : 'NNI'}</FL>
          <NniInput size="small" value={gerant.nni || ''} onChange={e => u('nni', e.target.value)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.passeport') : 'N° Passeport'}</FL>
          <Input size="small" value={gerant.num_passeport || ''} onChange={e => u('num_passeport', e.target.value)} />
        </Col>
      </Row>
      <Row gutter={8} style={{ marginTop: 6 }}>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.dateNaissance') : 'Date de naissance'}</FL>
          <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
            value={gerant.date_naissance ? dayjs(gerant.date_naissance) : null}
            onChange={d => u('date_naissance', d ? d.format('YYYY-MM-DD') : null)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.lieuNaissance') : 'Lieu de naissance'}</FL>
          <Input size="small" value={gerant.lieu_naissance || ''} onChange={e => u('lieu_naissance', e.target.value)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.telephone') : 'Téléphone'}</FL>
          <Input size="small" value={gerant.telephone || ''} onChange={e => u('telephone', e.target.value)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? t('hist.form.domicile') : 'Domicile'}</FL>
          <Input size="small" value={gerant.domicile || ''} onChange={e => u('domicile', e.target.value)} />
        </Col>
      </Row>
      <Row gutter={8} style={{ marginTop: 6 }}>
        <Col span={10}>
          <FL>{isAr ? t('hist.form.nationalite') : 'Nationalité'}</FL>
          <Select size="small" style={{ width: '100%' }}
            value={gerant.nationalite_id || undefined} allowClear showSearch
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
            filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
            onChange={v => u('nationalite_id', v || null)} />
        </Col>
        <Col span={14}>
          <FL style={{ color: '#ff4d4f' }}>
            {isAr ? (t('hist.form.fonction') || 'الوظيفة') : 'Fonction *'}
          </FL>
          <Select size="small" style={{ width: '100%' }}
            value={gerant.fonction_id || undefined}
            onChange={v => u('fonction_id', v || null)}
            options={(fonctions || []).map(f => ({
              value: f.id,
              label: isAr ? (f.libelle_ar || f.libelle_fr) : f.libelle_fr,
            }))}
            placeholder={isAr ? '...' : 'Sélectionner la fonction…'}
            status={!gerant.fonction_id ? 'error' : ''}
            allowClear showSearch
            filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
          />
          {!gerant.fonction_id && (
            <div style={{ color: '#ff4d4f', fontSize: 11, marginTop: 2 }}>
              {isAr ? 'الوظيفة مطلوبة' : 'La fonction est obligatoire.'}
            </div>
          )}
        </Col>
      </Row>
    </Card>
  );
};

// ── Carte Administrateur SA (conseil d'administration) ───────────────────────
const AdministrateurCard = ({ admin, idx, nationalites, onChange, onDelete, t, isAr }) => {
  const u = (field, val) => onChange(idx, { ...admin, [field]: val });
  const title = [admin.nom, admin.prenom].filter(Boolean).join(' ')
    || `${isAr ? 'عضو مجلس الإدارة' : 'Administrateur'} ${idx + 1}`;

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderColor: '#d4380d' }}
      title={<Text strong style={{ color: '#d4380d' }}>{title}</Text>}
      extra={<Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(idx)} />}
    >
      <Row gutter={8}>
        <Col span={4}>
          <FL>{t('field.civilite')}</FL>
          <Select size="small" style={{ width: '100%' }}
            value={admin.civilite || undefined}
            onChange={v => u('civilite', v)}
            options={getCiviliteOptions(isAr ? 'ar' : 'fr')}
          />
        </Col>
        <Col span={5}>
          <FL>{isAr ? 'اللقب' : 'Nom'}</FL>
          <Input size="small" value={admin.nom || ''} onChange={e => u('nom', e.target.value)}
            status={hasLowercase(admin.nom, isAr) ? 'error' : ''} />
          <UppercaseError show={hasLowercase(admin.nom, isAr)} />
        </Col>
        <Col span={5}>
          <FL>{isAr ? 'الاسم' : 'Prénom'}</FL>
          <Input size="small" value={admin.prenom || ''} onChange={e => u('prenom', e.target.value)} />
        </Col>
        <Col span={5}>
          <FL>{isAr ? 'رقم التعريف الوطني' : 'NNI'}</FL>
          <NniInput size="small" value={admin.nni || ''} onChange={e => u('nni', e.target.value)} />
        </Col>
        <Col span={5}>
          <FL>{isAr ? 'رقم جواز السفر' : 'N° Passeport'}</FL>
          <Input size="small" value={admin.num_passeport || ''} onChange={e => u('num_passeport', e.target.value)} />
        </Col>
      </Row>
      <Row gutter={8} style={{ marginTop: 6 }}>
        <Col span={6}>
          <FL>{isAr ? 'تاريخ الميلاد' : 'Date de naissance'}</FL>
          <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
            value={admin.date_naissance ? dayjs(admin.date_naissance) : null}
            onChange={d => u('date_naissance', d ? d.format('YYYY-MM-DD') : null)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? 'مكان الميلاد' : 'Lieu de naissance'}</FL>
          <Input size="small" value={admin.lieu_naissance || ''} onChange={e => u('lieu_naissance', e.target.value)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? 'الجنسية' : 'Nationalité'}</FL>
          <Select size="small" style={{ width: '100%' }}
            value={admin.nationalite_id || undefined} allowClear showSearch
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
            filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
            onChange={v => u('nationalite_id', v || null)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? 'المهمة في مجلس الإدارة' : 'Fonction au CA'}</FL>
          <Select size="small" style={{ width: '100%' }}
            value={admin.fonction_ca || undefined}
            onChange={v => u('fonction_ca', v || '')}
            options={[
              { value: 'PRESIDENT',            label: isAr ? 'الرئيس'             : 'Président du CA'          },
              { value: 'ADMINISTRATEUR',        label: isAr ? 'عضو مجلس الإدارة'  : 'Administrateur'           },
              { value: 'ADMINISTRATEUR_DG',     label: isAr ? 'مدير عام - عضو'    : 'Administrateur-DG'        },
              { value: 'ADMINISTRATEUR_DELEGUE',label: isAr ? 'مفوض مجلس الإدارة' : 'Administrateur délégué'   },
            ]}
            allowClear
          />
        </Col>
      </Row>
      <Row gutter={8} style={{ marginTop: 6 }}>
        <Col span={6}>
          <FL>{isAr ? 'تاريخ بداية المهمة' : 'Début de mandat'}</FL>
          <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
            value={admin.date_debut ? dayjs(admin.date_debut) : null}
            onChange={d => u('date_debut', d ? d.format('YYYY-MM-DD') : null)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? 'تاريخ نهاية المهمة' : 'Fin de mandat'}</FL>
          <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
            value={admin.date_fin ? dayjs(admin.date_fin) : null}
            onChange={d => u('date_fin', d ? d.format('YYYY-MM-DD') : null)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? 'الهاتف' : 'Téléphone'}</FL>
          <Input size="small" value={admin.telephone || ''} onChange={e => u('telephone', e.target.value)} />
        </Col>
        <Col span={6}>
          <FL>{isAr ? 'البريد الإلكتروني' : 'Email'}</FL>
          <Input size="small" value={admin.email || ''} onChange={e => u('email', e.target.value)} />
        </Col>
      </Row>
      <Row gutter={8} style={{ marginTop: 6 }}>
        <Col span={24}>
          <FL>{isAr ? 'العنوان' : 'Adresse'}</FL>
          <Input size="small" value={admin.adresse || ''} onChange={e => u('adresse', e.target.value)} />
        </Col>
      </Row>
    </Card>
  );
};

// ── Carte Commissaire aux comptes SA ─────────────────────────────────────────
const CommissaireCard = ({ commissaire, idx, nationalites, onChange, onDelete, t, isAr }) => {
  const u = (field, val) => onChange(idx, { ...commissaire, [field]: val });
  const isPH = (commissaire.type || 'PH') !== 'PM';

  const title = isPH
    ? ([commissaire.nom, commissaire.prenom].filter(Boolean).join(' ') || `${isAr ? 'مدقق الحسابات' : 'Commissaire'} ${idx + 1}`)
    : (commissaire.denomination || `${isAr ? 'مدقق الحسابات' : 'Commissaire'} ${idx + 1}`);

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderColor: '#531dab' }}
      title={
        <Space>
          <Select
            size="small"
            value={commissaire.type || 'PH'}
            style={{ width: 160 }}
            onChange={v => onChange(idx, { _key: commissaire._key, type: v, role: commissaire.role || 'TITULAIRE' })}
            options={[
              { value: 'PH', label: isAr ? 'شخص طبيعي'   : 'Personne physique' },
              { value: 'PM', label: isAr ? 'شخص اعتباري'  : 'Personne morale'   },
            ]}
          />
          <Text strong style={{ color: '#531dab' }}>{title}</Text>
        </Space>
      }
      extra={<Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(idx)} />}
    >
      <Row gutter={8} style={{ marginBottom: 6 }}>
        <Col span={8}>
          <FL>{isAr ? 'الدور' : 'Rôle'}</FL>
          <Select size="small" style={{ width: '100%' }}
            value={commissaire.role || 'TITULAIRE'}
            onChange={v => u('role', v)}
            options={[
              { value: 'TITULAIRE', label: isAr ? 'أصيل' : 'Titulaire' },
              { value: 'SUPPLEANT', label: isAr ? 'نائب'  : 'Suppléant' },
            ]}
          />
        </Col>
      </Row>
      {isPH ? (
        <>
          <Row gutter={8}>
            <Col span={4}>
              <FL>{t('field.civilite')}</FL>
              <Select size="small" style={{ width: '100%' }}
                value={commissaire.civilite || undefined}
                onChange={v => u('civilite', v)}
                options={getCiviliteOptions(isAr ? 'ar' : 'fr')}
              />
            </Col>
            <Col span={6}>
              <FL>{isAr ? 'اللقب' : 'Nom'}</FL>
              <Input size="small" value={commissaire.nom || ''} onChange={e => u('nom', e.target.value)}
                status={hasLowercase(commissaire.nom, isAr) ? 'error' : ''} />
              <UppercaseError show={hasLowercase(commissaire.nom, isAr)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? 'الاسم' : 'Prénom'}</FL>
              <Input size="small" value={commissaire.prenom || ''} onChange={e => u('prenom', e.target.value)} />
            </Col>
            <Col span={7}>
              <FL>{isAr ? 'رقم التعريف الوطني' : 'NNI'}</FL>
              <NniInput size="small" value={commissaire.nni || ''} onChange={e => u('nni', e.target.value)} />
            </Col>
          </Row>
          <Row gutter={8} style={{ marginTop: 6 }}>
            <Col span={6}>
              <FL>{isAr ? 'رقم جواز السفر' : 'N° Passeport'}</FL>
              <Input size="small" value={commissaire.num_passeport || ''} onChange={e => u('num_passeport', e.target.value)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? 'تاريخ الميلاد' : 'Date de naissance'}</FL>
              <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
                value={commissaire.date_naissance ? dayjs(commissaire.date_naissance) : null}
                onChange={d => u('date_naissance', d ? d.format('YYYY-MM-DD') : null)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? 'مكان الميلاد' : 'Lieu de naissance'}</FL>
              <Input size="small" value={commissaire.lieu_naissance || ''} onChange={e => u('lieu_naissance', e.target.value)} />
            </Col>
            <Col span={6}>
              <FL>{isAr ? 'الجنسية' : 'Nationalité'}</FL>
              <Select size="small" style={{ width: '100%' }}
                value={commissaire.nationalite_id || undefined} allowClear showSearch
                options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
                onChange={v => u('nationalite_id', v || null)} />
            </Col>
          </Row>
          <Row gutter={8} style={{ marginTop: 6 }}>
            <Col span={8}>
              <FL>{isAr ? 'الهاتف' : 'Téléphone'}</FL>
              <Input size="small" value={commissaire.telephone || ''} onChange={e => u('telephone', e.target.value)} />
            </Col>
            <Col span={8}>
              <FL>{isAr ? 'البريد الإلكتروني' : 'Email'}</FL>
              <Input size="small" value={commissaire.email || ''} onChange={e => u('email', e.target.value)} />
            </Col>
          </Row>
        </>
      ) : (
        <>
          <Row gutter={8}>
            <Col span={10}>
              <FL>{isAr ? 'التسمية' : 'Dénomination'}</FL>
              <Input size="small" value={commissaire.denomination || ''} onChange={e => u('denomination', e.target.value)} />
            </Col>
            <Col span={7}>
              <FL>{isAr ? 'رقم السجل التجاري' : 'N° RC'}</FL>
              <Input size="small" value={commissaire.numero_rc || ''} onChange={e => u('numero_rc', e.target.value)} />
            </Col>
            <Col span={7}>
              <FL>{isAr ? 'الجنسية' : 'Nationalité'}</FL>
              <Select size="small" style={{ width: '100%' }}
                value={commissaire.nationalite_id || undefined} allowClear showSearch
                options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
                onChange={v => u('nationalite_id', v || null)} />
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
};

// ── Sous-formulaire Personne Physique ─────────────────────────────────────────
const SectionPH = ({ nationalites, fonctions, phGerantType, setPhGerantType, t, isAr }) => (
  <>
    <Row gutter={16}>
      <Col span={6}>
        <Form.Item
          label={t('field.civilite')}
          name="civilite"
          rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}
        >
          <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item
          label={isAr ? t('hist.form.nom') : 'Nom'}
          name="nom"
          rules={[{ required: true, message: isAr ? t('validation.nni') : 'Requis' }, uppercaseRule(isAr)]}
        >
          <Input />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={isAr ? t('hist.form.prenom') : 'Prénom'} name="prenom">
          <Input />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={isAr ? t('hist.form.denomCommerciale') : 'Dénomination / Nom commercial'} name="denomination_commerciale">
          <Input placeholder={isAr ? '' : 'ex: Boulangerie Dupont'} />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item label={isAr ? t('hist.form.nni') : 'NNI'} name="nni" rules={[nniRule(t)]}>
          <NniInput />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item label={isAr ? t('hist.form.passeport') : 'N° Passeport'} name="num_passeport">
          <Input />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item label={isAr ? t('hist.form.nationalite') : 'Nationalité'} name="nationalite_id">
          <Select
            options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
            allowClear showSearch
            filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
          />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item label={isAr ? t('hist.form.dateNaissance') : 'Date de naissance'} name="date_naissance">
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item label={isAr ? t('hist.form.lieuNaissance') : 'Lieu de naissance'} name="lieu_naissance">
          <Input />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item label={isAr ? t('hist.form.telephone') : 'Téléphone'} name="telephone">
          <Input />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={16}>
      <Col span={16}>
        <Form.Item label={isAr ? t('hist.form.domicile') : 'Adresse / Domicile'} name="adresse">
          <Input />
        </Form.Item>
      </Col>
    </Row>

    <Divider orientation="left">{isAr ? t('hist.form.gerantSection') : 'Gérant'}</Divider>
    <Form.Item label={isAr ? t('hist.form.gerantEntreprise') : "Gérant de l'entreprise"}>
      <Radio.Group value={phGerantType} onChange={e => setPhGerantType(e.target.value)}>
        <Radio value="self">{isAr ? t('hist.form.gerantSelf') : 'Elle/lui-même (le/la commerçant(e))'}</Radio>
        <Radio value="other">{isAr ? t('hist.form.gerantOther') : 'Autre gérant désigné'}</Radio>
      </Radio.Group>
    </Form.Item>
    {phGerantType === 'other' && (
      <>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label={isAr ? t('hist.form.gerantNom') : 'Nom du gérant'}
              name="gerant_nom"
              rules={[{ required: true, message: 'Requis' }, uppercaseRule(isAr)]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={isAr ? (t('hist.form.gerantFonction') || 'الوظيفة') : 'Fonction du gérant'}
              name="gerant_fonction_id"
              rules={[{ required: true, message: isAr ? 'مطلوب' : 'La fonction est obligatoire.' }]}
            >
              <Select
                showSearch allowClear
                placeholder={isAr ? '...' : 'Sélectionner…'}
                options={(fonctions || []).map(f => ({
                  value: f.id,
                  label: isAr ? (f.libelle_ar || f.libelle_fr) : f.libelle_fr,
                }))}
                filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.gerantPrenom') : 'Prénom du gérant'} name="gerant_prenom">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.gerantNationalite') : 'Nationalité du gérant'} name="gerant_nationalite_id">
              <Select
                options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                allowClear showSearch
                filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.gerantNni') : 'NNI du gérant'} name="gerant_nni" rules={[nniRule(t)]}>
              <NniInput />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.gerantPasseport') : 'N° Passeport du gérant'} name="gerant_num_passeport">
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </>
    )}
  </>
);

// ── Sous-formulaire Personne Morale ───────────────────────────────────────────
const SectionPM = ({
  nationalites, fonctions, formesJuridiques,
  associes, setAssocies, gerants, setGerants,
  administrateurs, setAdministrateurs, commissaires, setCommissaires,
  t, isAr,
}) => {
  const totalPart = associes.reduce((s, a) => s + (parseFloat(a.part_sociale) || 0), 0);

  // Détection SA en temps réel via le contexte Form
  const formeJuridiqueId = Form.useWatch('forme_juridique_id');
  const estSA = formesJuridiques.find(f => f.id === formeJuridiqueId)?.code === 'SA';

  const newAssoc = () => ({
    _key: Date.now(), type: 'PH',
    nom: '', prenom: '', nni: '', num_passeport: '',
    date_naissance: null, lieu_naissance: '', telephone: '', domicile: '',
    nationalite_id: null, part_sociale: 0,
  });
  const newGer = () => ({
    _key: Date.now(),
    nom: '', prenom: '', nni: '', num_passeport: '',
    date_naissance: null, lieu_naissance: '', telephone: '', domicile: '',
    nationalite_id: null, fonction_id: null,
  });
  const newAdmin = () => ({
    _key: Date.now(),
    civilite: '', nom: '', prenom: '', nni: '', num_passeport: '',
    date_naissance: null, lieu_naissance: '',
    nationalite_id: null, fonction_ca: '',
    date_debut: null, date_fin: null,
    telephone: '', email: '', adresse: '',
  });
  const newCommissaire = () => ({
    _key: Date.now(), type: 'PH', role: 'TITULAIRE',
    civilite: '', nom: '', prenom: '', nni: '', num_passeport: '',
    date_naissance: null, lieu_naissance: '',
    nationalite_id: null, telephone: '', email: '',
    denomination: '', numero_rc: '',
  });

  const updateAssoc  = (idx, val) => setAssocies(prev => prev.map((a, i) => i === idx ? val : a));
  const deleteAssoc  = (idx) => setAssocies(prev => prev.filter((_, i) => i !== idx));
  const updateGer    = (idx, val) => setGerants(prev => prev.map((g, i) => i === idx ? val : g));
  const deleteGer    = (idx) => setGerants(prev => prev.filter((_, i) => i !== idx));
  const updateAdmin  = (idx, val) => setAdministrateurs(prev => prev.map((a, i) => i === idx ? val : a));
  const deleteAdmin  = (idx) => setAdministrateurs(prev => prev.filter((_, i) => i !== idx));
  const updateComm   = (idx, val) => setCommissaires(prev => prev.map((c, i) => i === idx ? val : c));
  const deleteComm   = (idx) => setCommissaires(prev => prev.filter((_, i) => i !== idx));

  return (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={isAr ? t('hist.form.denomination') : 'Dénomination'}
            name="denomination"
            rules={[{ required: true, message: 'Requis' }]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label={isAr ? t('hist.form.sigle') : 'Sigle'} name="sigle"><Input /></Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label={isAr ? t('hist.form.formeJuridique') : 'Forme juridique'} name="forme_juridique_id">
            <Select options={formesJuridiques.map(f => ({ value: f.id, label: isAr ? (f.libelle_ar || f.libelle_fr) : `${f.code} – ${f.libelle_fr}` }))} allowClear />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={5}>
          <Form.Item label={isAr ? t('hist.form.capital') : 'Capital social'} name="capital_social">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Col>
        <Col span={5}>
          <Form.Item label={isAr ? t('hist.form.devise') : 'Devise'} name="devise_capital">
            <Select options={[
              { value: 'MRU', label: isAr ? 'أوقية موريتانية'  : 'MRU – Ouguiya mauritanien' },
              { value: 'EUR', label: isAr ? 'يورو'              : 'EUR – Euro' },
              { value: 'USD', label: isAr ? 'دولار أمريكي'      : 'USD – Dollar américain' },
            ]} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label={isAr ? t('hist.form.dureeAns') : 'Durée (ans)'} name="duree_societe">
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label={isAr ? t('hist.form.siege') : 'Siège social'} name="siege_social"><Input /></Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={6}><Form.Item label={isAr ? t('hist.form.telephone') : 'Téléphone'} name="telephone"><Input /></Form.Item></Col>
        <Col span={6}><Form.Item label={isAr ? t('hist.form.fax') : 'Fax'} name="fax"><Input /></Form.Item></Col>
        <Col span={6}><Form.Item label={isAr ? t('hist.form.email') : 'Email'} name="email"><Input type="email" /></Form.Item></Col>
        <Col span={6}><Form.Item label={isAr ? t('hist.form.bp') : 'BP'} name="bp"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item label={isAr ? t('hist.form.objetSocial') : 'Objet social'} name="objet_social">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Col>
      </Row>

      {/* Associés */}
      <Divider orientation="left">{isAr ? t('hist.form.associesSection') : 'Associés'}</Divider>
      {totalPart > 0 && Math.abs(totalPart - 100) > 0.1 && (
        <Alert type="warning" showIcon style={{ marginBottom: 10 }}
          message={`${isAr ? t('hist.form.totalParts') : 'Total parts sociales'} : ${totalPart.toFixed(2)}% (${isAr ? 'يجب أن يكون 100%' : 'doit être 100 %'})`} />
      )}
      {associes.map((a, i) => (
        <AssocieCard
          key={a._key}
          assoc={a} idx={i}
          nationalites={nationalites}
          onChange={updateAssoc}
          onDelete={deleteAssoc}
          t={t} isAr={isAr}
        />
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => setAssocies(p => [...p, newAssoc()])}
        style={{ marginBottom: 16 }}>
        {isAr ? t('hist.form.ajouterAssocie') : 'Ajouter associé'}
      </Button>

      {/* Gérants */}
      <Divider orientation="left">{isAr ? t('hist.form.gerantsSection') : 'Gérants / Dirigeants'}</Divider>
      {gerants.map((g, i) => (
        <GerantCard
          key={g._key}
          gerant={g} idx={i}
          nationalites={nationalites}
          fonctions={fonctions}
          onChange={updateGer}
          onDelete={deleteGer}
          t={t} isAr={isAr}
        />
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => setGerants(p => [...p, newGer()])}>
        {isAr ? t('hist.form.ajouterGerant') : 'Ajouter gérant'}
      </Button>

      {/* ── Sections SA : Administrateurs & Commissaires aux comptes ────────── */}
      {estSA && (
        <>
          {/* Conseil d'administration */}
          <Divider orientation="left" style={{ borderColor: '#d4380d' }}>
            <span style={{ color: '#d4380d' }}>
              {isAr ? 'مجلس الإدارة' : '🏛️ Conseil d\'administration'}
            </span>
          </Divider>
          {administrateurs.length === 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 10 }}
              message={isAr
                ? 'يجب إضافة مدير واحد على الأقل لشركة المساهمة (SA).'
                : 'Une SA doit comporter au moins un administrateur au conseil d\'administration.'} />
          )}
          {administrateurs.map((a, i) => (
            <AdministrateurCard
              key={a._key}
              admin={a} idx={i}
              nationalites={nationalites}
              onChange={updateAdmin}
              onDelete={deleteAdmin}
              t={t} isAr={isAr}
            />
          ))}
          <Button size="small" icon={<PlusOutlined />}
            style={{ marginBottom: 16, borderColor: '#d4380d', color: '#d4380d' }}
            onClick={() => setAdministrateurs(p => [...p, newAdmin()])}>
            {isAr ? 'إضافة عضو مجلس الإدارة' : 'Ajouter administrateur'}
          </Button>

          {/* Commissaires aux comptes */}
          <Divider orientation="left" style={{ borderColor: '#531dab' }}>
            <span style={{ color: '#531dab' }}>
              {isAr ? 'مدققو الحسابات' : '🔍 Commissaires aux comptes'}
            </span>
          </Divider>
          {commissaires.map((c, i) => (
            <CommissaireCard
              key={c._key}
              commissaire={c} idx={i}
              nationalites={nationalites}
              onChange={updateComm}
              onDelete={deleteComm}
              t={t} isAr={isAr}
            />
          ))}
          <Button size="small" icon={<PlusOutlined />}
            style={{ marginBottom: 8, borderColor: '#531dab', color: '#531dab' }}
            onClick={() => setCommissaires(p => [...p, newCommissaire()])}>
            {isAr ? 'إضافة مدقق حسابات' : 'Ajouter commissaire aux comptes'}
          </Button>
        </>
      )}
    </>
  );
};

// ── Sous-formulaire Succursale ─────────────────────────────────────────────────
const SectionSC = ({ nationalites, fonctions, formesJuridiques, domaines, directeurs, setDirecteurs, t, isAr }) => {
  const newDir = () => ({
    _key: Date.now(),
    nom: '', prenom: '', nni: '', num_passeport: '',
    date_naissance: null, lieu_naissance: '', telephone: '', domicile: '',
    nationalite_id: null, fonction_id: null,
  });
  const updateDir = (idx, val) => setDirecteurs(prev => prev.map((d, i) => i === idx ? val : d));
  const deleteDir = (idx)       => setDirecteurs(prev => prev.filter((_, i) => i !== idx));

  return (
    <>
      {/* ── Bloc Succursale ─────────────────────────────────────────────────── */}
      <Card title={isAr ? t('hist.form.scTitle') : '🌐 Succursale'} size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={isAr ? t('hist.form.denomination') : 'Dénomination'}
              name="denomination"
              rules={[{ required: true, message: 'Requis' }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={isAr ? t('hist.form.contactTel') : 'Contact / Téléphone'} name="contact">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              label={isAr ? t('hist.form.adresseSiege') : 'Adresse du siège social'}
              name="adresse_siege"
              rules={[{ required: true, message: 'Requis' }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.email') : 'Email'} name="email">
              <Input type="email" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label={isAr ? t('hist.form.domaines') : "Domaines d'activités"} name="domaines">
              <Select
                mode="multiple"
                options={domaines.map(d => ({ value: d.id, label: isAr ? (d.libelle_ar || d.libelle_fr) : d.libelle_fr }))}
                allowClear showSearch
                filterOption={(inp, opt) => opt.label.toLowerCase().includes(inp.toLowerCase())}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={isAr ? t('hist.form.objetSocial') : 'Objet social'} name="objet_social">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={isAr ? t('hist.form.observations') : 'Observations'} name="observations">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* ── Bloc Directeurs ─────────────────────────────────────────────────── */}
      <Divider orientation="left">{isAr ? t('hist.form.directeursSection') : '🧑‍💼 Directeurs'}</Divider>
      {directeurs.map((dir, i) => (
        <GerantCard
          key={dir._key}
          gerant={dir} idx={i}
          nationalites={nationalites}
          fonctions={fonctions}
          onChange={updateDir}
          onDelete={deleteDir}
          t={t} isAr={isAr}
        />
      ))}
      <Button size="small" icon={<PlusOutlined />}
        onClick={() => setDirecteurs(p => [...p, newDir()])}
        style={{ marginBottom: 16 }}>
        {isAr ? t('hist.form.ajouterDirecteur') : 'Ajouter directeur'}
      </Button>

      {/* ── Bloc Société mère ────────────────────────────────────────────────── */}
      <Card title={isAr ? t('hist.form.maisonMereTitle') : '🏦 Société mère'} size="small" style={{ marginTop: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={isAr ? t('hist.form.denomSociale') : 'Dénomination sociale'}
              name={['maison_mere', 'denomination_sociale']}
              rules={[{ required: true, message: 'Requis' }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={isAr ? t('hist.form.formeJuridique') : 'Forme juridique'} name={['maison_mere', 'forme_juridique_id']}>
              <Select
                options={formesJuridiques.map(f => ({ value: f.id, label: isAr ? (f.libelle_ar || f.libelle_fr) : `${f.code} – ${f.libelle_fr}` }))}
                allowClear showSearch
                filterOption={(inp, opt) => opt.label.toLowerCase().includes(inp.toLowerCase())}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.dateDepotStatuts') : 'Date dépôt (Statuts)'} name={['maison_mere', 'date_depot_statuts']}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.dateImmat') : "Date d'immatriculation"} name={['maison_mere', 'date_immatriculation']}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.numRC') : 'N° RC'} name={['maison_mere', 'numero_rc']}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.nationalite') : 'Nationalité'} name={['maison_mere', 'nationalite_id']}>
              <Select
                options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                allowClear showSearch
                filterOption={(inp, opt) => opt.label.toLowerCase().includes(inp.toLowerCase())}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.capital') : 'Capital social'} name={['maison_mere', 'capital_social']}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isAr ? t('hist.form.siege') : 'Siège social'} name={['maison_mere', 'siege_social']}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </>
  );
};

// ── Composant principal ────────────────────────────────────────────────────────
const FormulaireHistorique = () => {
  const { id }      = useParams();
  const isEdit      = Boolean(id);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [form]      = Form.useForm();
  const { t, isAr } = useLanguage();

  const [currentStep,      setCurrentStep]      = useState(0);
  const [typeEntite,       setTypeEntite]       = useState(null);
  const [phGerantType,     setPhGerantType]     = useState('self');
  const [associes,         setAssocies]         = useState([]);
  const [gerants,          setGerants]          = useState([]);
  const [directeurs,       setDirecteurs]       = useState([]);
  const [administrateurs,  setAdministrateurs]  = useState([]);
  const [commissaires,     setCommissaires]     = useState([]);
  const [pendingFiles,     setPendingFiles]     = useState([]);

  const { data: nationalites     = [] } = useQuery({ queryKey: ['nationalites'],     queryFn: () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []) });
  const { data: formesJuridiques = [] } = useQuery({ queryKey: ['formes-juridiques'], queryFn: () => parametrageAPI.formesJuridiques().then(r => r.data?.results || r.data || []) });

  // Détection SA pour la validation à la soumission
  const _formeJuridiqueId = Form.useWatch('forme_juridique_id', form);
  const estSA = formesJuridiques.find(f => f.id === _formeJuridiqueId)?.code === 'SA';
  const { data: localites        = [] } = useQuery({ queryKey: ['localites'],         queryFn: () => parametrageAPI.localites().then(r => r.data?.results || r.data || []) });
  const { data: domaines         = [] } = useQuery({ queryKey: ['domaines'],           queryFn: () => parametrageAPI.domaines().then(r => r.data?.results || r.data || []) });
  const { data: fonctions        = [] } = useQuery({ queryKey: ['fonctions'],           queryFn: () => parametrageAPI.fonctions().then(r => r.data?.results || r.data || []) });

  const { data: existing } = useQuery({
    queryKey: ['historique', id],
    queryFn:  () => historiqueAPI.get(id).then(r => r.data),
    enabled:  isEdit,
  });

  useEffect(() => {
    if (!existing) return;
    const d = existing.donnees || {};
    setTypeEntite(existing.type_entite);

    if (existing.type_entite === 'PH') {
      setPhGerantType(d.gerant?.type === 'other' ? 'other' : 'self');
    }

    let dateImmat = null;
    if (existing.date_immatriculation) {
      dateImmat = dayjs(existing.date_immatriculation);
      if (d.heure_immatriculation) {
        const [h, m] = d.heure_immatriculation.split(':').map(Number);
        dateImmat = dateImmat.hour(h || 0).minute(m || 0).second(0);
      }
    }

    form.setFieldsValue({
      type_entite:          existing.type_entite,
      numero_ra:            existing.numero_ra,
      numero_chrono:        existing.numero_chrono,
      annee_chrono:         existing.annee_chrono,
      date_immatriculation: dateImmat,
      localite:             existing.localite,
      demandeur:            existing.demandeur || '',
      ...d,
      gerant_nom:            d.gerant?.type === 'other' ? (d.gerant.nom_gerant    || '') : '',
      gerant_prenom:         d.gerant?.type === 'other' ? (d.gerant.prenom_gerant || '') : '',
      gerant_nationalite_id: d.gerant?.type === 'other' ? (d.gerant.nationalite_id || null) : null,
      gerant_nni:            d.gerant?.type === 'other' ? (d.gerant.nni            || '') : '',
      gerant_num_passeport:  d.gerant?.type === 'other' ? (d.gerant.num_passeport  || '') : '',
      devise_capital: d.devise_capital || 'MRU',
      devise:         d.devise         || 'MRU',
    });

    if (existing.type_entite === 'PM') {
      setAssocies(       (d.associes        || []).map((a, i) => ({ ...a, _key: i, type: a.type || 'PH' })));
      setGerants(        (d.gerants         || []).map((g, i) => ({ ...g, _key: i })));
      setAdministrateurs((d.administrateurs || []).map((a, i) => ({ ...a, _key: i })));
      setCommissaires(   (d.commissaires    || []).map((c, i) => ({ ...c, _key: i })));
    }

    if (existing.type_entite === 'SC') {
      setDirecteurs((d.directeurs || []).map((dir, i) => ({ ...dir, _key: i })));
      const mm = d.maison_mere || {};
      if (mm.denomination_sociale || mm.date_depot_statuts || mm.date_immatriculation) {
        form.setFieldsValue({
          maison_mere: {
            ...mm,
            date_depot_statuts:   mm.date_depot_statuts   ? dayjs(mm.date_depot_statuts)   : null,
            date_immatriculation: mm.date_immatriculation ? dayjs(mm.date_immatriculation) : null,
          },
        });
      }
    }
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async (payload) => {
      // Sauvegarder les corrections (update) ou créer une nouvelle demande
      let res = await (isEdit ? historiqueAPI.update(id, payload) : historiqueAPI.create(payload));
      // Si le dossier était RETOURNE, soumettre automatiquement au greffier
      if (isEdit && existing?.statut === 'RETOURNE') {
        try {
          await historiqueAPI.soumettre(res.data.id || id);
        } catch {
          // Si l'envoi échoue, les corrections sont sauvegardées — l'agent peut soumettre manuellement
        }
      }
      const ihId = res.data.id;
      for (const pf of pendingFiles) {
        try {
          const fd = new FormData();
          fd.append('fichier',              pf.file);
          fd.append('nom_fichier',          pf.name);
          fd.append('immatriculation_hist', ihId);
          await documentAPI.upload(fd);
        } catch {
          message.warning(`${isAr ? 'تعذّر رفع' : "Impossible d'uploader"} ${pf.name}.`);
        }
      }
      return res;
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ['historiques'] });
      message.success(isAr ? t('hist.msg.saved') : 'Demande enregistrée en brouillon.');
      navigate(`/historique/${res.data.id}`);
    },
    onError: (e) => {
      const data = e.response?.data;
      let detail;
      if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
        // Réponse HTML brute (erreur serveur 500) — afficher un message propre
        detail = isAr
          ? 'حدث خطأ أثناء الحفظ. يرجى التحقق من البيانات المدخلة أو الاتصال بالمسؤول.'
          : "Une erreur est survenue lors de l'enregistrement. Vérifiez les données saisies ou contactez l'administrateur.";
      } else {
        detail = data?.detail || (data ? JSON.stringify(data) : null) || e.message
          || (isAr ? 'خطأ غير معروف' : 'Erreur inconnue');
      }
      message.error(`${isAr ? 'خطأ' : 'Erreur'} : ${detail}`, 8);
    },
  });

  const buildDonnees = (values, dayjsDate) => {
    const heureImmat = dayjsDate ? dayjsDate.format('HH:mm') : null;

    if (typeEntite === 'PH') {
      const gerant = phGerantType === 'self'
        ? { type: 'self' }
        : {
            type:           'other',
            nom_gerant:     values.gerant_nom          || '',
            prenom_gerant:  values.gerant_prenom       || '',
            nationalite_id: values.gerant_nationalite_id || null,
            nni:            values.gerant_nni           || '',
            num_passeport:  values.gerant_num_passeport || '',
            fonction_id:    values.gerant_fonction_id   || null,
          };
      return {
        heure_immatriculation:    heureImmat,
        civilite:                 values.civilite               || '',
        nom:                      values.nom                    || '',
        prenom:                   values.prenom                 || '',
        denomination_commerciale: values.denomination_commerciale || '',
        nni:                      values.nni                    || '',
        num_passeport:            values.num_passeport          || '',
        nationalite_id:           values.nationalite_id         || null,
        date_naissance:           values.date_naissance ? values.date_naissance.format('YYYY-MM-DD') : null,
        lieu_naissance:           values.lieu_naissance         || '',
        adresse:                  values.adresse                || '',
        telephone:                values.telephone              || '',
        gerant,
        domaines: [],
        choix_be: values.choix_be || '',
      };
    }

    if (typeEntite === 'PM') {
      // Sync dénomination bilingue — déclaration juridique libre (mixte AR/FR autorisé)
      const _denomPM   = values.denomination    || '';
      const _denomArPM = values.denomination_ar || _denomPM;
      return {
        heure_immatriculation: heureImmat,
        denomination:          _denomPM,
        denomination_ar:       _denomArPM,
        sigle:                 values.sigle            || '',
        forme_juridique_id:    values.forme_juridique_id || null,
        capital_social:        values.capital_social   || null,
        devise_capital:        values.devise_capital   || 'MRU',
        duree_societe:         values.duree_societe    || null,
        siege_social:          values.siege_social     || '',
        telephone:             values.telephone        || '',
        fax:                   values.fax              || '',
        email:                 values.email            || '',
        site_web:              values.site_web         || '',
        bp:                    values.bp               || '',
        objet_social:          values.objet_social     || '',
        domaines: [],
        associes: associes.map(a => ({
          type: a.type || 'PH',
          ...(( a.type || 'PH') === 'PM' ? {
            denomination:        a.denomination        || '',
            numero_rc:           a.numero_rc           || '',
            siege_social:        a.siege_social        || '',
            date_immatriculation: a.date_immatriculation || null,
            nationalite_id:      a.nationalite_id      || null,
            part_sociale:        a.part_sociale        || 0,
          } : {
            nom:             a.nom             || '',
            prenom:          a.prenom          || '',
            nni:             a.nni             || '',
            num_passeport:   a.num_passeport   || '',
            date_naissance:  a.date_naissance  || null,
            lieu_naissance:  a.lieu_naissance  || '',
            telephone:       a.telephone       || '',
            domicile:        a.domicile        || '',
            nationalite_id:  a.nationalite_id  || null,
            part_sociale:    a.part_sociale    || 0,
          }),
        })),
        gerants: gerants.map(g => ({
          nom:             g.nom             || '',
          prenom:          g.prenom          || '',
          nni:             g.nni             || '',
          num_passeport:   g.num_passeport   || '',
          date_naissance:  g.date_naissance  || null,
          lieu_naissance:  g.lieu_naissance  || '',
          telephone:       g.telephone       || '',
          domicile:        g.domicile        || '',
          nationalite_id:  g.nationalite_id  || null,
          fonction_id:     g.fonction_id     || null,
        })),
        administrateurs: administrateurs.map(a => ({
          civilite:       a.civilite       || '',
          nom:            a.nom            || '',
          prenom:         a.prenom         || '',
          nni:            a.nni            || '',
          num_passeport:  a.num_passeport  || '',
          date_naissance: a.date_naissance || null,
          lieu_naissance: a.lieu_naissance || '',
          nationalite_id: a.nationalite_id || null,
          fonction_ca:    a.fonction_ca    || '',
          date_debut:     a.date_debut     || null,
          date_fin:       a.date_fin       || null,
          telephone:      a.telephone      || '',
          email:          a.email          || '',
          adresse:        a.adresse        || '',
        })),
        commissaires: commissaires.map(c => ({
          type: c.type || 'PH',
          role: c.role || 'TITULAIRE',
          ...((c.type || 'PH') === 'PM' ? {
            denomination:   c.denomination   || '',
            numero_rc:      c.numero_rc      || '',
            nationalite_id: c.nationalite_id || null,
          } : {
            civilite:       c.civilite       || '',
            nom:            c.nom            || '',
            prenom:         c.prenom         || '',
            nni:            c.nni            || '',
            num_passeport:  c.num_passeport  || '',
            date_naissance: c.date_naissance || null,
            lieu_naissance: c.lieu_naissance || '',
            nationalite_id: c.nationalite_id || null,
            telephone:      c.telephone      || '',
            email:          c.email          || '',
          }),
        })),
        choix_be: values.choix_be || '',
      };
    }

    if (typeEntite === 'SC') {
      const mm      = values.maison_mere || {};
      const mmDepot = mm.date_depot_statuts;
      const mmImmat = mm.date_immatriculation;
      // Sync dénomination bilingue — déclaration juridique libre (mixte AR/FR autorisé)
      const _denomSC   = values.denomination    || '';
      const _denomArSC = values.denomination_ar || _denomSC;
      return {
        heure_immatriculation: heureImmat,
        denomination:          _denomSC,
        denomination_ar:       _denomArSC,
        contact:               values.contact       || '',
        adresse_siege:         values.adresse_siege || '',
        email:                 values.email         || '',
        objet_social:          values.objet_social  || '',
        observations:          values.observations  || '',
        domaines:              values.domaines      || [],
        choix_be:              values.choix_be      || '',
        directeurs: directeurs.map(dir => ({
          nom:             dir.nom             || '',
          prenom:          dir.prenom          || '',
          nni:             dir.nni             || '',
          num_passeport:   dir.num_passeport   || '',
          date_naissance:  dir.date_naissance  || null,
          lieu_naissance:  dir.lieu_naissance  || '',
          telephone:       dir.telephone       || '',
          domicile:        dir.domicile        || '',
          nationalite_id:  dir.nationalite_id  || null,
          fonction_id:     dir.fonction_id     || null,
        })),
        maison_mere: {
          denomination_sociale: mm.denomination_sociale || '',
          forme_juridique_id:   mm.forme_juridique_id   || null,
          date_depot_statuts:   mmDepot ? (dayjs.isDayjs(mmDepot) ? mmDepot.format('YYYY-MM-DD') : mmDepot) : null,
          date_immatriculation: mmImmat ? (dayjs.isDayjs(mmImmat) ? mmImmat.format('YYYY-MM-DD') : mmImmat) : null,
          numero_rc:            mm.numero_rc            || '',
          nationalite_id:       mm.nationalite_id       || null,
          capital_social:       mm.capital_social       || null,
          siege_social:         mm.siege_social         || '',
        },
      };
    }
    return {};
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields().catch(() => {});
      const values = form.getFieldsValue(true);

      if (!typeEntite) {
        message.error(isAr ? `يرجى اختيار ${t('hist.form.typeEntite')} (الخطوة 1)` : "Veuillez sélectionner le type d'entité (étape 1).");
        setCurrentStep(0); return;
      }
      const dateVal = values.date_immatriculation;
      if (!dateVal) {
        message.error(isAr ? `يرجى إدخال ${t('hist.form.dateHeureImmat')} (الخطوة 1)` : "Veuillez saisir la date et l'heure d'immatriculation (étape 1).");
        setCurrentStep(0); return;
      }
      const numeroRa = (values.numero_ra || '').toString().trim();
      if (!numeroRa) {
        message.error(isAr ? `${t('hist.form.numAnalytique')} مطلوب (الخطوة 1)` : "Le N° analytique est requis (étape 1).");
        setCurrentStep(0); return;
      }
      if (!values.numero_chrono) {
        message.error(isAr ? `${t('hist.form.numChrono')} مطلوب (الخطوة 1)` : "Le N° chronologique est requis (étape 1).");
        setCurrentStep(0); return;
      }
      if (!values.annee_chrono) {
        message.error(isAr ? `${t('hist.form.anneeChrono')} مطلوبة (الخطوة 1)` : "L'année chronologique est requise (étape 1).");
        setCurrentStep(0); return;
      }
      if (typeEntite === 'PH' && !values.nom?.trim()) {
        message.error(isAr ? `${t('hist.form.nom')} مطلوب (الخطوة 2)` : "Le nom du commerçant est requis (étape 2).");
        setCurrentStep(1); return;
      }
      if ((typeEntite === 'PM' || typeEntite === 'SC') && !values.denomination?.trim()) {
        message.error(isAr ? `${t('hist.form.denomination')} مطلوبة (الخطوة 2)` : "La dénomination est requise (étape 2).");
        setCurrentStep(1); return;
      }
      if (typeEntite === 'PM' && estSA && administrateurs.length === 0) {
        message.error(isAr
          ? 'يجب إضافة مدير واحد على الأقل في مجلس الإدارة للشركة المساهمة (الخطوة 2).'
          : "Une SA doit avoir au moins un administrateur au conseil d'administration (étape 2).");
        setCurrentStep(1); return;
      }
      if (!values.choix_be) {
        message.error(isAr ? `${t('hist.form.choixBELabel')} مطلوب (الخطوة 1)` : "Veuillez choisir une option pour le bénéficiaire effectif (étape 1).");
        setCurrentStep(0); return;
      }

      const dayjsDate = dayjs.isDayjs(dateVal) ? dateVal : dayjs(dateVal);
      if (!dayjsDate.isValid()) {
        message.error(isAr ? `${t('hist.form.dateHeureImmat')} غير صالح` : "Date d'immatriculation invalide."); setCurrentStep(0); return;
      }

      const payload = {
        type_entite:          typeEntite,
        numero_ra:            numeroRa,
        numero_chrono:        values.numero_chrono,
        annee_chrono:         values.annee_chrono,
        date_immatriculation: dayjsDate.format('YYYY-MM-DDTHH:mm:ss'),  // DateTimeField : date + heure obligatoires
        localite:             values.localite || null,
        demandeur:            (values.demandeur || '').trim(),
        donnees:              buildDonnees(values, dayjsDate),
      };

      saveMut.mutate(payload);
    } catch (err) {
      console.error('Erreur formulaire historique :', err);
      message.error((isAr ? 'خطأ غير متوقع : ' : 'Erreur inattendue : ') + (err.message || (isAr ? 'خطأ غير معروف' : 'Erreur inconnue')));
    }
  };

  const goToStep = (next) => {
    if (next > currentStep && currentStep === 0) {
      form.validateFields(['type_entite', 'numero_ra', 'annee_chrono', 'numero_chrono', 'date_immatriculation'])
        .then(() => {
          if (!typeEntite) {
            message.warning(isAr ? `يرجى اختيار ${t('hist.form.typeEntite')}` : "Choisissez le type d'entité.");
            return;
          }
          setCurrentStep(next);
        })
        .catch(() => {});
    } else {
      setCurrentStep(next);
    }
  };

  const steps = [
    { title: isAr ? t('hist.form.step1') : 'Données historiques' },
    { title: isAr ? t('hist.form.step2') : 'Données entreprise'  },
    { title: isAr ? t('hist.form.step3') : 'Pièces jointes'      },
  ];

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/historique')} />
        <Title level={4} style={{ margin: 0 }}>
          {isEdit
            ? (isAr ? t('hist.form.editTitle') : 'Modifier la demande historique')
            : (isAr ? t('hist.form.newTitle')  : 'Nouvelle immatriculation historique')
          }
        </Title>
      </div>

      <Steps current={currentStep} size="small" style={{ marginBottom: 24 }}
        items={steps.map(s => ({ title: s.title }))} />

      <Form form={form} layout="vertical" preserve
        initialValues={{ devise_capital: 'MRU', devise: 'MRU' }}>

        {/* ── Étape 1 ── */}
        {currentStep === 0 && (
          <Card title={isAr ? t('hist.form.step1') : 'Données historiques'} size="small">
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message={isAr ? t('hist.form.alertInfo') : "Saisissez les numéros et dates exacts de l'ancien dossier. Aucune génération automatique."} />
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label={isAr ? t('hist.form.typeEntite') : "Type d'entité"}
                  name="type_entite"
                  rules={[{ required: true, message: 'Requis' }]}
                >
                  <Select onChange={v => setTypeEntite(v)} options={[
                    { value: 'PH', label: isAr ? t('entity.ph') : 'Personne physique' },
                    { value: 'PM', label: isAr ? t('entity.pm') : 'Personne morale' },
                    { value: 'SC', label: isAr ? t('entity.sc') : 'Succursale' },
                  ]} disabled={isEdit} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={isAr ? t('hist.form.numAnalytique') : 'N° Analytique'}
                  name="numero_ra"
                  rules={[{ required: true, message: 'Requis' }, { pattern: /^\d+$/, message: isAr ? 'أرقام فقط' : 'Uniquement numérique' }]}
                >
                  <Input placeholder={isAr ? '' : 'ex: 000013'} disabled={isEdit} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={isAr ? t('hist.form.greffe') : 'Greffe (Localité)'} name="localite">
                  <Select options={localites.map(l => ({ value: l.id, label: isAr ? (l.libelle_ar || l.libelle_fr) : l.libelle_fr }))} allowClear showSearch
                    filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={isAr ? 'مقدم الطلب' : 'Demandeur'}
                  name="demandeur"
                  rules={[{ required: true, message: isAr ? 'مقدم الطلب إلزامي' : 'Le demandeur est obligatoire' }]}
                  extra={isAr ? 'الشخص الذي يتقدم إلى السجل' : 'Personne qui se présente au registre'}
                >
                  <Input placeholder={isAr ? 'الاسم الكامل لمقدم الطلب' : 'Nom complet du demandeur'} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  label={isAr ? t('hist.form.anneeChrono') : 'Année du chrono'}
                  name="annee_chrono"
                  rules={[{ required: true, message: 'Requis' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1900} max={2100} placeholder={isAr ? '' : 'ex: 2001'} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label={isAr ? t('hist.form.numChrono') : 'N° Chronologique'}
                  name="numero_chrono"
                  rules={[{ required: true, message: 'Requis' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} placeholder={isAr ? '' : 'ex: 145'} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={isAr ? t('hist.form.dateHeureImmat') : "Date et heure d'immatriculation"}
                  name="date_immatriculation"
                  rules={[{ required: true, message: 'Requis' }]}
                >
                  <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm"
                    placeholder={isAr ? 'يي/شش/سسسس سس:دد' : 'JJ/MM/AAAA HH:mm'} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            {/* Bénéficiaire effectif */}
            <Divider style={{ margin: '12px 0' }} />
            <Alert
              type="warning" showIcon style={{ marginBottom: 12 }}
              message={isAr ? t('hist.form.alertBE') : "Déclaration du bénéficiaire effectif — obligatoire (article 63, décret n°2021-033)"}
            />
            <Form.Item
              name="choix_be"
              label={isAr ? t('hist.form.choixBELabel') : 'Déclaration du bénéficiaire effectif'}
              rules={[{ required: true, message: isAr ? `${t('hist.form.choixBELabel')} مطلوب` : 'Veuillez choisir une option pour le bénéficiaire effectif.' }]}
            >
              <Radio.Group>
                <Space direction="vertical">
                  <Radio value="immediat">
                    <b>{isAr ? t('hist.form.beDeclareImmediat') : '✅ Déclaré immédiatement'}</b>
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                      {isAr ? t('hist.form.beDeclareImmediatInfo') : '— déclaré dès l\'immatriculation'}
                    </span>
                  </Radio>
                  <Radio value="15_jours">
                    <b>{isAr ? t('hist.form.be15Jours') : '⏳ Sera déclaré dans un délai de 15 jours'}</b>
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                      {isAr ? t('hist.form.be15JoursInfo') : '— délai maximum autorisé'}
                    </span>
                  </Radio>
                </Space>
              </Radio.Group>
            </Form.Item>

            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <Button type="primary" onClick={() => goToStep(1)}>
                {isAr ? t('hist.form.suivant') : 'Suivant →'}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Étape 2 ── */}
        {currentStep === 1 && typeEntite && (
          <Card title={isAr ? t('hist.form.step2Title') : "Données de l'entreprise"} size="small">
            {typeEntite === 'PH' && (
              <SectionPH
                nationalites={nationalites}
                fonctions={fonctions}
                phGerantType={phGerantType}
                setPhGerantType={setPhGerantType}
                t={t} isAr={isAr}
              />
            )}
            {typeEntite === 'PM' && (
              <SectionPM
                nationalites={nationalites} fonctions={fonctions} formesJuridiques={formesJuridiques}
                associes={associes}         setAssocies={setAssocies}
                gerants={gerants}           setGerants={setGerants}
                administrateurs={administrateurs} setAdministrateurs={setAdministrateurs}
                commissaires={commissaires}       setCommissaires={setCommissaires}
                t={t} isAr={isAr}
              />
            )}
            {typeEntite === 'SC' && (
              <SectionSC
                nationalites={nationalites}
                fonctions={fonctions}
                formesJuridiques={formesJuridiques}
                domaines={domaines}
                directeurs={directeurs}
                setDirecteurs={setDirecteurs}
                t={t} isAr={isAr}
              />
            )}
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <Button onClick={() => goToStep(0)} style={{ marginRight: 8 }}>
                {isAr ? t('hist.form.precedent') : '← Précédent'}
              </Button>
              <Button type="primary" onClick={() => goToStep(2)}>
                {isAr ? t('hist.form.suivant') : 'Suivant →'}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Étape 3 ── */}
        {currentStep === 2 && (
          <Card title={isAr ? t('hist.form.step3') : 'Pièces jointes'} size="small">
            <PiecesJointesPending
              pendingFiles={pendingFiles}
              onAddPending={f => setPendingFiles(prev => [...prev, f])}
              onRemovePending={uid => setPendingFiles(prev => prev.filter(p => p.uid !== uid))}
            />
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Button onClick={() => goToStep(1)} style={{ marginRight: 8 }}>
                {isAr ? t('hist.form.precedent') : '← Précédent'}
              </Button>
              <Button type="primary" icon={<SaveOutlined />}
                loading={saveMut.isPending}
                style={{ background: (isEdit && existing?.statut === 'RETOURNE') ? '#d46b08' : '#1a4480' }}
                onClick={handleSubmit}>
                {(isEdit && existing?.statut === 'RETOURNE')
                  ? (isAr ? t('action.soumettreNouveau') : t('action.soumettreNouveau'))
                  : (isAr ? t('hist.form.enregistrerBrouillon') : 'Enregistrer en brouillon')}
              </Button>
            </div>
          </Card>
        )}
      </Form>
    </div>
  );
};

export default FormulaireHistorique;

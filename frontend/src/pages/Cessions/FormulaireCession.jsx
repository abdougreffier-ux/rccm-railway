import React, { useState, useEffect } from 'react';
import {
  Form, Input, InputNumber, Button, Card, Row, Col,
  Table, Tag, Alert, Spin, Typography, Select, Radio, DatePicker, message, Divider,
} from 'antd';
import {
  SearchOutlined, ArrowLeftOutlined, SaveOutlined,
  PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cessionAPI, parametrageAPI, documentAPI } from '../../api/api';
import { PiecesJointesPending } from '../../components/PiecesJointesCard';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

let _keySeq = 0;
const nextKey = () => ++_keySeq;

// ── Civilités disponibles ──────────────────────────────────────────────────────
const CIVILITES_FR = [
  { value: 'M.',   label: 'M.' },
  { value: 'Mme',  label: 'Mme' },
  { value: 'Dr.',  label: 'Dr.' },
  { value: 'Prof.', label: 'Prof.' },
];
const CIVILITES_AR = [
  { value: 'M.',    label: 'السيد' },
  { value: 'Mme',   label: 'السيدة' },
  { value: 'Dr.',   label: 'د.' },
  { value: 'Prof.', label: 'أ.د.' },
];

// ── Gabarit ligne vide ─────────────────────────────────────────────────────────
const LIGNE_VIDE = () => ({
  // ── Cédant ──
  cedant_id:                      null,
  // ── Type cessionnaire (EXISTANT / NOUVEAU) ──
  cessionnaire_type:              'EXISTANT',
  cessionnaire_assoc_id:          null,
  // ── Nouveau cessionnaire — type de personne ──
  cessionnaire_type_personne:     'PH',       // 'PH' ou 'PM'
  // ── Nouveau PH ──
  cessionnaire_civilite:          '',
  cessionnaire_prenom:            '',
  cessionnaire_nom:               '',
  cessionnaire_nationalite_id:    null,
  cessionnaire_nni:               '',
  // ── Nouveau PM ──
  cessionnaire_denomination:      '',
  cessionnaire_forme_juridique:   '',
  cessionnaire_num_identification:'',
  cessionnaire_nationalite_pm:    '',
  cessionnaire_siege_social:      '',
  // ── Parts ──
  nombre_parts:                   null,
});

// ── Nom d'affichage résumé d'un cessionnaire NOUVEAU ──────────────────────────
const cessNomNouveau = (l) => {
  if (l.cessionnaire_type_personne === 'PM') {
    return l.cessionnaire_denomination || '—';
  }
  const civ = l.cessionnaire_civilite ? `${l.cessionnaire_civilite} ` : '';
  const full = `${l.cessionnaire_prenom || ''} ${l.cessionnaire_nom || ''}`.trim();
  return `${civ}${full}` || '—';
};

// ── Complétude identité cessionnaire (ligne confirmée OU currentLigne) ─────────
// Supporte les deux nommages : cessionnaire_assoc_id (currentLigne) et
// cessionnaire_associe_id (lignes confirmées).
const _ligneIdentiteComplete = (l) => {
  if (l.cessionnaire_type === 'EXISTANT')
    return !!(l.cessionnaire_associe_id || l.cessionnaire_assoc_id);
  if (l.cessionnaire_type_personne === 'PH')
    return !!(
      l.cessionnaire_civilite?.trim() &&
      l.cessionnaire_prenom?.trim() &&
      l.cessionnaire_nom?.trim() &&
      l.cessionnaire_nationalite_id &&
      l.cessionnaire_nni?.trim()
    );
  // PM
  return !!(
    l.cessionnaire_denomination?.trim() &&
    l.cessionnaire_forme_juridique?.trim() &&
    l.cessionnaire_num_identification?.trim() &&
    l.cessionnaire_nationalite_pm?.trim() &&
    l.cessionnaire_siege_social?.trim()
  );
};

// ── Liste des champs manquants (pour feedback temps réel) ─────────────────────
const _champsManquants = (l, isAr) => {
  if (l.cessionnaire_type === 'EXISTANT') {
    return (l.cessionnaire_assoc_id || l.cessionnaire_associe_id)
      ? [] : [isAr ? 'الشريك المستفيد' : 'Associé bénéficiaire'];
  }
  if (l.cessionnaire_type_personne === 'PH') {
    const m = [];
    if (!l.cessionnaire_civilite?.trim())       m.push(isAr ? 'اللقب'          : 'Civilité');
    if (!l.cessionnaire_prenom?.trim())          m.push(isAr ? 'الاسم الأول'    : 'Prénom');
    if (!l.cessionnaire_nom?.trim())             m.push(isAr ? 'اسم العائلة'    : 'Nom');
    if (!l.cessionnaire_nationalite_id)          m.push(isAr ? 'الجنسية'        : 'Nationalité');
    if (!l.cessionnaire_nni?.trim())             m.push(isAr ? 'رقم التعريف'    : 'NNI / Passeport');
    return m;
  }
  // PM
  const m = [];
  if (!l.cessionnaire_denomination?.trim())      m.push(isAr ? 'التسمية التجارية'        : 'Dénomination');
  if (!l.cessionnaire_forme_juridique?.trim())   m.push(isAr ? 'الشكل القانوني'           : 'Forme juridique');
  if (!l.cessionnaire_num_identification?.trim())m.push(isAr ? 'رقم التعريف'              : 'N° identification');
  if (!l.cessionnaire_nationalite_pm?.trim())    m.push(isAr ? 'الجنسية / بلد المنشأ'     : 'Nationalité / Pays');
  if (!l.cessionnaire_siege_social?.trim())      m.push(isAr ? 'المقر الاجتماعي'          : 'Siège social');
  return m;
};

// ─────────────────────────────────────────────────────────────────────────────

const FormulaireCession = () => {
  const { id }        = useParams();
  const location      = useLocation();
  const isCorrection  = location.pathname.endsWith('/corriger');
  const isEdit        = Boolean(id) && !isCorrection;
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const [form]        = Form.useForm();
  const { isAr }      = useLanguage();

  const [raData,        setRaData]        = useState(null);
  const [lookupVal,     setLookupVal]     = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState('');
  const [pendingFiles,  setPendingFiles]  = useState([]);

  // Lignes confirmées
  const [lignes,       setLignes]       = useState([]);
  // Ligne en cours de saisie
  const [currentLigne, setCurrentLigne] = useState(LIGNE_VIDE());

  const { data: nationalites = [] } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []),
  });

  const { data: existing } = useQuery({
    queryKey: ['cession', id],
    queryFn:  () => cessionAPI.get(id).then(r => r.data),
    enabled:  isEdit || isCorrection,
  });

  useEffect(() => {
    if (!existing) return;
    cessionAPI.lookup({ numero_ra: existing.ra_numero }).then(r => {
      setRaData(r.data);
      setLookupVal(existing.ra_numero);
      form.setFieldsValue({
        demandeur:    existing.demandeur || '',
        observations: existing.observations || '',
      });
      // ── Restauration des lignes ───────────────────────────────────────────
      if (existing.lignes?.length) {
        setLignes(existing.lignes.map(l => ({ ...l, _key: nextKey() })));
      } else if (existing.cedants?.length) {
        const builtLignes = [];
        existing.cedants.forEach(c => {
          const matchingCess = (existing.cessionnaires || []).slice(0, 1);
          matchingCess.forEach(cess => {
            builtLignes.push({
              _key:                        nextKey(),
              cedant_associe_id:           c.associe_id,
              cedant_nom:                  c.nom || '',
              cessionnaire_type:           cess.type || 'EXISTANT',
              cessionnaire_associe_id:     cess.associe_id || null,
              cessionnaire_type_personne:  'PH',
              cessionnaire_civilite:       '',
              cessionnaire_prenom:         cess.prenom || '',
              cessionnaire_nom:            cess.nom || '',
              cessionnaire_nationalite_id: cess.nationalite_id || null,
              cessionnaire_nni:            '',
              cessionnaire_denomination:   '',
              cessionnaire_forme_juridique:'',
              cessionnaire_num_identification:'',
              cessionnaire_nationalite_pm: '',
              cessionnaire_siege_social:   '',
              nombre_parts:                c.nombre_parts || 0,
            });
          });
        });
        setLignes(builtLignes);
      } else if (existing.associe_cedant) {
        setLignes([{
          _key:                        nextKey(),
          cedant_associe_id:           existing.associe_cedant,
          cedant_nom:                  existing.cedant_nom || '',
          cessionnaire_type:           existing.beneficiaire_type || 'EXISTANT',
          cessionnaire_associe_id:     existing.beneficiaire_associe || null,
          cessionnaire_type_personne:  'PH',
          cessionnaire_civilite:       '',
          cessionnaire_prenom:         existing.beneficiaire_data?.prenom || '',
          cessionnaire_nom:            existing.beneficiaire_data?.nom || existing.beneficiaire_nom || '',
          cessionnaire_nationalite_id: existing.beneficiaire_data?.nationalite_id || null,
          cessionnaire_nni:            '',
          cessionnaire_denomination:   '',
          cessionnaire_forme_juridique:'',
          cessionnaire_num_identification:'',
          cessionnaire_nationalite_pm: '',
          cessionnaire_siege_social:   '',
          nombre_parts:                existing.nombre_parts_cedees || 0,
        }]);
      }
    }).catch(() => {});
  }, [existing]);

  // ── Recherche dossier ─────────────────────────────────────────────────────
  const handleLookup = async () => {
    const v = lookupVal.trim();
    if (!v) { setLookupError('Saisissez un N° analytique.'); return; }
    setLookupLoading(true);
    setLookupError('');
    try {
      const r = await cessionAPI.lookup({ numero_ra: v });
      setRaData(r.data);
    } catch (err) {
      setLookupError(err.response?.data?.detail || 'Dossier introuvable ou type incompatible.');
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Parts engagées / disponibles pour un cédant ───────────────────────────
  const partsEngagees   = (cedantId) =>
    lignes.filter(l => l.cedant_associe_id === cedantId)
          .reduce((s, l) => s + (l.nombre_parts || 0), 0);

  const partsDisponibles = (cedantId) => {
    const assoc = (raData?.associes || []).find(a => a.id === cedantId);
    return (assoc?.nombre_parts || 0) - partsEngagees(cedantId);
  };

  // ── Ajouter la ligne courante à la liste confirmée ────────────────────────
  const ajouterLigne = () => {
    const l = currentLigne;
    if (!l.cedant_id) {
      message.error(isAr ? 'اختر المتنازِل.' : 'Sélectionnez un associé cédant.');
      return;
    }

    // Vérification complétude identité (tous champs obligatoires)
    const manquants = _champsManquants(l, isAr);
    if (manquants.length > 0) {
      message.error(
        (isAr
          ? `هوية المستفيد غير مكتملة. الحقول الناقصة : ${manquants.join('، ')}`
          : `Identité cessionnaire incomplète. Champs manquants : ${manquants.join(', ')}`),
        6
      );
      return;
    }

    if (!l.nombre_parts || l.nombre_parts <= 0) {
      message.error(isAr ? 'عدد الحصص يجب أن يكون أكبر من 0.' : 'Le nombre de parts doit être > 0.');
      return;
    }
    const disponibles = partsDisponibles(l.cedant_id);
    if (l.nombre_parts > disponibles) {
      message.error(
        isAr
          ? `حصص غير كافية : ${disponibles} حصة متاحة لهذا المتنازِل.`
          : `Parts insuffisantes : ${disponibles} part(s) disponible(s) pour ce cédant.`
      );
      return;
    }

    const cedantAssoc = (raData?.associes || []).find(a => a.id === l.cedant_id);
    const cedantNom   = cedantAssoc?.nom || '';
    const cessNom = l.cessionnaire_type === 'EXISTANT'
      ? ((raData?.associes || []).find(a => a.id === l.cessionnaire_assoc_id)?.nom || '')
      : (l.cessionnaire_type_personne === 'PM'
          ? l.cessionnaire_denomination
          : `${l.cessionnaire_prenom || ''} ${l.cessionnaire_nom || ''}`.trim());

    setLignes(prev => [...prev, {
      _key:                         nextKey(),
      cedant_associe_id:            l.cedant_id,
      cedant_nom:                   cedantNom,
      cessionnaire_type:            l.cessionnaire_type,
      cessionnaire_associe_id:      l.cessionnaire_assoc_id || null,
      cessionnaire_type_personne:   l.cessionnaire_type_personne,
      cessionnaire_civilite:        l.cessionnaire_civilite || '',
      cessionnaire_prenom:          l.cessionnaire_prenom || '',
      cessionnaire_nom:             l.cessionnaire_type === 'EXISTANT' ? cessNom : (l.cessionnaire_nom || ''),
      cessionnaire_nationalite_id:  l.cessionnaire_nationalite_id || null,
      cessionnaire_nni:             l.cessionnaire_nni || '',
      cessionnaire_denomination:    l.cessionnaire_denomination || '',
      cessionnaire_forme_juridique: l.cessionnaire_forme_juridique || '',
      cessionnaire_num_identification: l.cessionnaire_num_identification || '',
      cessionnaire_nationalite_pm:  l.cessionnaire_nationalite_pm || '',
      cessionnaire_siege_social:    l.cessionnaire_siege_social || '',
      nombre_parts:                 l.nombre_parts,
    }]);

    setCurrentLigne(prev => ({ ...LIGNE_VIDE(), cedant_id: prev.cedant_id }));
  };

  // ── Récapitulatif par cédant ───────────────────────────────────────────────
  const cedantsStats = {};
  lignes.forEach(l => {
    if (!l.cedant_associe_id) return;
    if (!cedantsStats[l.cedant_associe_id]) {
      const assoc = (raData?.associes || []).find(a => a.id === l.cedant_associe_id);
      cedantsStats[l.cedant_associe_id] = {
        nom:   l.cedant_nom || assoc?.nom || '—',
        total: 0,
        max:   assoc?.nombre_parts || 0,
      };
    }
    cedantsStats[l.cedant_associe_id].total += l.nombre_parts || 0;
  });
  const hasOversubscription = Object.values(cedantsStats).some(s => s.total > s.max);
  const hasInvalidLines     = lignes.some(l => !_ligneIdentiteComplete(l));

  // ── Aperçu de répartition ─────────────────────────────────────────────────
  const computePreview = () => {
    if (!raData || lignes.length === 0) return [];
    const list = raData.associes.map(a => ({ ...a, parts_apres: a.nombre_parts, sortie: false }));

    const partsByCedant = {};
    lignes.forEach(l => {
      partsByCedant[l.cedant_associe_id] = (partsByCedant[l.cedant_associe_id] || 0) + l.nombre_parts;
    });
    Object.entries(partsByCedant).forEach(([id, total]) => {
      const a = list.find(x => x.id === Number(id));
      if (!a) return;
      if (total >= a.nombre_parts) { a.parts_apres = 0; a.sortie = true; }
      else { a.parts_apres = a.nombre_parts - total; }
    });

    const partsByCess = {};
    lignes.forEach(l => {
      if (l.cessionnaire_type === 'EXISTANT' && l.cessionnaire_associe_id) {
        partsByCess[l.cessionnaire_associe_id] = (partsByCess[l.cessionnaire_associe_id] || 0) + l.nombre_parts;
      }
    });
    Object.entries(partsByCess).forEach(([id, total]) => {
      const a = list.find(x => x.id === Number(id));
      if (a) a.parts_apres = (a.parts_apres || 0) + total;
    });

    const nouveauxMap = {};
    lignes.forEach(l => {
      if (l.cessionnaire_type === 'NOUVEAU') {
        const key = l.cessionnaire_type_personne === 'PM'
          ? `PM_${l.cessionnaire_denomination}`
          : `PH_${l.cessionnaire_prenom || ''}_${l.cessionnaire_nom || ''}`;
        if (!nouveauxMap[key]) {
          nouveauxMap[key] = {
            id:           `NEW_${key}`,
            nom:          cessNomNouveau(l),
            nombre_parts: 0, parts_apres: 0, sortie: false,
          };
        }
        nouveauxMap[key].parts_apres += l.nombre_parts;
      }
    });

    const allList = [...list, ...Object.values(nouveauxMap)];
    const total   = allList.filter(a => !a.sortie).reduce((s, a) => s + a.parts_apres, 0);
    return allList.map(a => ({
      ...a,
      pct_apres: total > 0 ? ((a.sortie ? 0 : a.parts_apres) / total * 100).toFixed(1) : '0.0',
    }));
  };

  const preview = computePreview();

  // ── Enregistrement ────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async (data) => {
      let res;
      if (isCorrection) {
        res = await cessionAPI.modifierCorrectif(id, data);
      } else {
        res = await (isEdit ? cessionAPI.update(id, data) : cessionAPI.create(data));
      }
      const cessionId = res.data.id;
      for (const pf of pendingFiles) {
        try {
          const fd = new FormData();
          fd.append('fichier',     pf.file);
          fd.append('nom_fichier', pf.name);
          fd.append('cession',     cessionId);
          await documentAPI.upload(fd);
        } catch {
          message.warning(`Impossible d'uploader ${pf.name}.`);
        }
      }
      return res;
    },
    onSuccess: (res) => {
      message.success(isCorrection ? 'Correction appliquée.' : 'Cession enregistrée en brouillon.');
      queryClient.invalidateQueries({ queryKey: ['cessions'] });
      navigate(`/cessions/${res.data.id}`);
    },
    onError: (e) => {
      const data = e.response?.data;
      if (!data) { message.error('Erreur de connexion au serveur.', 5); return; }
      if (data.detail) { message.error(data.detail, 6); return; }
      if (typeof data === 'object') {
        const msgs = Object.entries(data)
          .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join(' | ');
        if (msgs) { message.error(msgs, 8); return; }
      }
      message.error(String(data).slice(0, 200) || 'Erreur inconnue.', 6);
    },
  });

  const onFinish = (values) => {
    if (!raData)           { message.warning(isAr ? 'ابحث أولاً عن ملف.' : "Recherchez d'abord un dossier."); return; }
    if (lignes.length < 1) { message.warning(isAr ? 'أضف سطراً واحداً على الأقل.' : 'Ajoutez au moins une ligne de cession.'); return; }
    if (hasInvalidLines) {
      message.error(
        isAr
          ? 'بعض سطور التنازل تحتوي على هوية مستفيد غير مكتملة. يرجى تصحيحها قبل الحفظ.'
          : "Certaines lignes contiennent une identité cessionnaire incomplète. Corrigez-les avant d'enregistrer.",
        6
      );
      return;
    }
    if (hasOversubscription) {
      message.error(
        isAr
          ? 'بعض المتنازِلين يتنازلون عن حصص تفوق ما يملكون.'
          : "Certains cédants cèdent plus de parts qu'ils n'en détiennent."
      );
      return;
    }

    const lignesPayload = lignes.map(({ _key, ...rest }) => rest);
    const payload = {
      ...(isCorrection ? {} : { ra: raData.id }),
      demandeur:    (values.demandeur || '').trim(),
      lignes:       lignesPayload,
      observations: values.observations || '',
      date_acte:    values.date_acte ? values.date_acte.format('YYYY-MM-DDTHH:mm:ss') : null,
      ...(isCorrection ? {} : { langue_acte: isAr ? 'ar' : 'fr' }),
    };
    saveMut.mutate(payload);
  };

  // ── Options selects ───────────────────────────────────────────────────────
  const cedantOptions = (raData?.associes || []).map(a => ({
    value: a.id,
    label: `${a.nom} — ${a.nombre_parts} parts`,
  }));

  const cedantsExitants = Object.entries(cedantsStats)
    .filter(([, s]) => s.total >= s.max)
    .map(([id]) => Number(id));
  const benefOptions = (raData?.associes || [])
    .filter(a => !cedantsExitants.includes(a.id))
    .map(a => ({ value: a.id, label: `${a.nom} — ${a.nombre_parts} parts` }));

  const natOptions = nationalites.map(n => ({
    value: n.id,
    label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr,
  }));

  const civiliteOptions = isAr ? CIVILITES_AR : CIVILITES_FR;

  // ── Colonnes table lignes confirmées ──────────────────────────────────────
  const lignesColumns = [
    { title: '#', key: 'idx', width: 36, render: (_, __, i) => i + 1 },
    {
      title: isAr ? 'المتنازِل' : 'Cédant',
      dataIndex: 'cedant_nom', key: 'cedant',
      render: (v, r) => {
        const stat = cedantsStats[r.cedant_associe_id];
        return (
          <span>
            {v}
            {stat && stat.total >= stat.max &&
              <Tag color="orange" style={{ marginLeft: 4 }}>
                {isAr ? 'تنازل كلي' : 'Cession totale'}
              </Tag>}
          </span>
        );
      },
    },
    { title: '→', key: 'arrow', width: 28, align: 'center', render: () => '→' },
    {
      title: isAr ? 'المستفيد' : 'Cessionnaire',
      key: 'cess',
      render: r => {
        const incomplete = !_ligneIdentiteComplete(r);
        const warnTag = incomplete
          ? <Tag color="red" style={{ marginLeft: 4 }}>⚠ {isAr ? 'ناقص' : 'Incomplet'}</Tag>
          : null;
        if (r.cessionnaire_type === 'EXISTANT') {
          return <span>{r.cessionnaire_nom || '—'}{warnTag}</span>;
        }
        const typeTag = r.cessionnaire_type_personne === 'PM'
          ? <Tag color="blue" style={{ marginRight: 4 }}>{isAr ? 'شخص اعتباري' : 'PM'}</Tag>
          : <Tag color="green" style={{ marginRight: 4 }}>{isAr ? 'شخص طبيعي جديد' : 'Nouveau PH'}</Tag>;
        if (r.cessionnaire_type_personne === 'PM') {
          return (
            <span>
              {typeTag}
              <strong>{r.cessionnaire_denomination}</strong>
              {r.cessionnaire_forme_juridique && <Text type="secondary"> ({r.cessionnaire_forme_juridique})</Text>}
              {warnTag}
            </span>
          );
        }
        const civ  = r.cessionnaire_civilite ? `${r.cessionnaire_civilite} ` : '';
        const name = `${r.cessionnaire_prenom || ''} ${r.cessionnaire_nom || ''}`.trim();
        return (
          <span>
            {typeTag}
            <strong>{civ}{name}</strong>
            {r.cessionnaire_nni && <Text type="secondary"> · NNI : {r.cessionnaire_nni}</Text>}
            {warnTag}
          </span>
        );
      },
    },
    {
      title: isAr ? 'الحصص' : 'Parts',
      dataIndex: 'nombre_parts', key: 'parts', width: 80,
    },
    {
      title: '', key: 'del', width: 48,
      render: (_, r) => (
        <Button danger size="small" icon={<DeleteOutlined />}
          onClick={() => setLignes(prev => prev.filter(l => l._key !== r._key))} />
      ),
    },
  ];

  const previewColumns = [
    { title: isAr ? 'الشريك' : 'Associé',    dataIndex: 'nom',          key: 'nom' },
    { title: isAr ? 'الحصص قبل' : 'Parts avant', dataIndex: 'nombre_parts', key: 'avant', width: 110 },
    {
      title: isAr ? 'الحصص بعد' : 'Parts après', dataIndex: 'parts_apres', key: 'apres', width: 110,
      render: (v, r) => r.sortie
        ? <Tag color="default">{isAr ? 'خروج' : 'Sorti'}</Tag>
        : <Text type={v !== r.nombre_parts ? 'warning' : undefined}>{v}</Text>,
    },
    { title: '% après', dataIndex: 'pct_apres', key: 'pct', width: 90, render: v => `${v}%` },
  ];

  const currentCedantAssoc = (raData?.associes || []).find(a => a.id === currentLigne.cedant_id);
  const disponibles = currentLigne.cedant_id ? partsDisponibles(currentLigne.cedant_id) : 0;

  // Prêt à ajouter : cédant ok + identité complète + parts > 0 + pas de dépassement
  const currentManquants  = currentLigne.cessionnaire_type
    ? _champsManquants(currentLigne, isAr)
    : [];
  const currentLigneReady = (
    !!currentLigne.cedant_id &&
    disponibles > 0 &&
    currentManquants.length === 0 &&
    !!currentLigne.nombre_parts && currentLigne.nombre_parts > 0 &&
    currentLigne.nombre_parts <= disponibles
  );

  // ── Helper champ label ─────────────────────────────────────────────────────
  const FL = ({ fr, ar, required }) => (
    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>
      {required && <span style={{ color: '#ef4444', marginRight: 2 }}>*</span>}
      {isAr ? ar : fr}
    </div>
  );

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/cessions')} />
        <Title level={4} style={{ margin: 0 }}>
          {isCorrection
            ? (isAr ? 'تصحيح التنازل' : 'Cession corrective')
            : isEdit
              ? (isAr ? 'تعديل التنازل' : 'Modifier la cession')
              : (isAr ? 'تنازل جديد عن حصص' : 'Nouvelle cession de parts')}
        </Title>
      </div>

      {/* ── Étape 1 — Recherche dossier ────────────────────────────────────── */}
      <Card title={isAr ? 'الخطوة 1 — البحث عن الملف' : 'Étape 1 — Recherche du dossier'}
        size="small" style={{ marginBottom: 16 }}>
        <Row gutter={8} align="middle">
          <Col flex="auto">
            <Input placeholder={isAr ? 'رقم السجل التحليلي' : 'N° analytique (ex: 000013)'}
              value={lookupVal}
              onChange={e => setLookupVal(e.target.value)} onPressEnter={handleLookup}
              disabled={isEdit || isCorrection} />
          </Col>
          <Col>
            <Button icon={<SearchOutlined />} onClick={handleLookup}
              loading={lookupLoading} disabled={isEdit || isCorrection}>
              {isAr ? 'بحث' : 'Rechercher'}
            </Button>
          </Col>
        </Row>
        {lookupError && <Alert type="error" message={lookupError} style={{ marginTop: 8 }} showIcon />}
        {raData && (
          <Alert type="success" style={{ marginTop: 8 }}
            message={<><strong>{raData.numero_ra}</strong> — {raData.denomination} ({raData.type_entite})</>}
            showIcon />
        )}
      </Card>

      {raData && (
        <Spin spinning={lookupLoading}>
          <Form form={form} layout="vertical" onFinish={onFinish}>

            {/* ── Demandeur ─────────────────────────────────────────────────── */}
            <Card size="small" style={{ marginBottom: 16, borderLeft: '4px solid #1a4480' }}
              title={<span style={{ color: '#1a4480' }}>
                {isAr ? 'مقدم الطلب والتاريخ' : 'Demandeur et horodatage'}
              </span>}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label={isAr ? 'مقدم الطلب' : 'Demandeur'} name="demandeur"
                    rules={[{ required: true, message: isAr ? 'الحقل إلزامي' : 'Le demandeur est obligatoire' }]}
                    extra={isAr ? 'الشخص الذي تقدّم بالطلب في السجل' : 'Personne qui se présente au registre du commerce'}>
                    <Input placeholder={isAr ? 'الاسم الكامل' : 'Nom complet du demandeur'} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={isAr ? 'تاريخ ووقت التنازل' : "Date et heure de l'acte"}
                    name="date_acte" initialValue={dayjs()}>
                    <DatePicker style={{ width: '100%' }} showTime={{ format: 'HH:mm' }}
                      format="DD/MM/YYYY HH:mm" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* ── Étape 2 — Saisie d'une ligne de cession ────────────────────── */}
            <Card
              size="small"
              style={{ marginBottom: 16, borderLeft: '4px solid #b45309' }}
              title={
                <span style={{ color: '#b45309' }}>
                  {isAr ? 'الخطوة 2 — إضافة سطر تنازل' : 'Étape 2 — Nouvelle ligne de cession'}
                  <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                    {isAr ? 'أدخل كل نقل: المتنازِل → المستفيد → الحصص'
                           : 'Saisir chaque transfert Cédant → Cessionnaire individuellement'}
                  </Text>
                </span>
              }
            >
              {/* ── Ligne 1 : Cédant + Type ──────────────────────────────────── */}
              <Row gutter={[12, 8]} align="bottom">
                {/* Cédant */}
                <Col xs={24} md={10}>
                  <FL fr="Cédant" ar="المتنازِل" required />
                  <Select
                    value={currentLigne.cedant_id}
                    options={cedantOptions}
                    placeholder={isAr ? 'اختر المتنازِل' : 'Sélectionner le cédant'}
                    style={{ width: '100%' }}
                    onChange={v => setCurrentLigne(prev => ({ ...prev, cedant_id: v, nombre_parts: null }))}
                  />
                  {currentLigne.cedant_id && (
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                      {disponibles > 0
                        ? <><Text type="success">{disponibles}</Text> {isAr ? 'حصة متاحة' : 'part(s) disponible(s)'}</>
                        : <Text type="danger">{isAr ? 'لا توجد حصص متاحة' : 'Aucune part disponible'}</Text>}
                    </div>
                  )}
                </Col>

                {/* Type cessionnaire */}
                <Col xs={24} md={7}>
                  <FL fr="Type cessionnaire" ar="نوع المستفيد" required />
                  <Radio.Group
                    value={currentLigne.cessionnaire_type}
                    onChange={e => setCurrentLigne({
                      ...LIGNE_VIDE(),
                      cedant_id:     currentLigne.cedant_id,
                      nombre_parts:  currentLigne.nombre_parts,
                      cessionnaire_type: e.target.value,
                    })}
                  >
                    <Radio value="EXISTANT">{isAr ? 'شريك موجود' : 'Existant'}</Radio>
                    <Radio value="NOUVEAU">{isAr ? 'جديد' : 'Nouveau'}</Radio>
                  </Radio.Group>
                </Col>

                {/* EXISTANT — sélection + parts + ajouter */}
                {currentLigne.cessionnaire_type === 'EXISTANT' && (
                  <>
                    <Col xs={24} md={5}>
                      <FL fr="Associé bénéficiaire" ar="الشريك المستفيد" required />
                      <Select
                        value={currentLigne.cessionnaire_assoc_id}
                        options={benefOptions}
                        placeholder={isAr ? 'اختر الشريك' : 'Sélectionner'}
                        style={{ width: '100%' }}
                        onChange={v => setCurrentLigne(prev => ({ ...prev, cessionnaire_assoc_id: v }))}
                      />
                    </Col>
                    <Col xs={12} md={4}>
                      <FL fr="Parts cédées" ar="الحصص المتنازَل عنها" required />
                      <InputNumber
                        value={currentLigne.nombre_parts}
                        min={1} max={disponibles > 0 ? disponibles : undefined}
                        style={{ width: '100%' }}
                        placeholder={disponibles > 0 ? `max ${disponibles}` : ''}
                        onChange={v => setCurrentLigne(prev => ({ ...prev, nombre_parts: v }))}
                      />
                    </Col>
                    <Col xs={12} md={3} style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={ajouterLigne}
                        style={currentLigneReady
                          ? { background: '#b45309', borderColor: '#b45309', width: '100%' }
                          : { width: '100%' }}
                        disabled={!currentLigneReady}>
                        {isAr ? 'إضافة' : 'Ajouter'}
                      </Button>
                    </Col>
                  </>
                )}
              </Row>

              {/* ── NOUVEAU — bloc identité complet ─────────────────────────── */}
              {currentLigne.cessionnaire_type === 'NOUVEAU' && (
                <div style={{
                  marginTop: 14,
                  padding: '14px 16px 10px',
                  background: '#fefce8',
                  border: '1px dashed #ca8a04',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                    {isAr ? '🆕 هوية المستفيد الجديد' : '🆕 Identité du nouveau cessionnaire'}
                  </div>

                  {/* PH / PM toggle */}
                  <Row gutter={[12, 8]} style={{ marginBottom: 10 }}>
                    <Col span={24}>
                      <FL fr="Type de personne" ar="نوع الشخص" required />
                      <Radio.Group
                        value={currentLigne.cessionnaire_type_personne}
                        onChange={e => setCurrentLigne(prev => ({
                          ...prev,
                          cessionnaire_type_personne:  e.target.value,
                          cessionnaire_civilite:       '',
                          cessionnaire_prenom:         '',
                          cessionnaire_nom:            '',
                          cessionnaire_nationalite_id: null,
                          cessionnaire_nni:            '',
                          cessionnaire_denomination:   '',
                          cessionnaire_forme_juridique:'',
                          cessionnaire_num_identification: '',
                          cessionnaire_nationalite_pm: '',
                          cessionnaire_siege_social:   '',
                        }))}
                      >
                        <Radio value="PH">{isAr ? 'شخص طبيعي' : 'Personne physique'}</Radio>
                        <Radio value="PM">{isAr ? 'شخص اعتباري' : 'Personne morale'}</Radio>
                      </Radio.Group>
                    </Col>
                  </Row>

                  {/* ── Champs Personne Physique ─────────────────────────── */}
                  {currentLigne.cessionnaire_type_personne === 'PH' && (
                    <Row gutter={[12, 8]}>
                      <Col xs={12} sm={6} md={4}>
                        <FL fr="Civilité" ar="اللقب" required />
                        <Select
                          value={currentLigne.cessionnaire_civilite || undefined}
                          options={civiliteOptions}
                          placeholder="—"
                          allowClear
                          style={{ width: '100%' }}
                          onChange={v => setCurrentLigne(prev => ({ ...prev, cessionnaire_civilite: v || '' }))}
                        />
                      </Col>
                      <Col xs={12} sm={6} md={5}>
                        <FL fr="Prénom" ar="الاسم الأول" required />
                        <Input
                          value={currentLigne.cessionnaire_prenom}
                          placeholder={isAr ? 'الاسم الأول' : 'Prénom'}
                          onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_prenom: e.target.value }))}
                        />
                      </Col>
                      <Col xs={12} sm={6} md={5}>
                        <FL fr="Nom" ar="اسم العائلة" required />
                        <Input
                          value={currentLigne.cessionnaire_nom}
                          placeholder={isAr ? 'اسم العائلة' : 'Nom de famille'}
                          onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_nom: e.target.value }))}
                        />
                      </Col>
                      <Col xs={12} sm={6} md={5}>
                        <FL fr="NNI / Passeport" ar="رقم التعريف / جواز السفر" required />
                        <Input
                          value={currentLigne.cessionnaire_nni}
                          placeholder={isAr ? 'NNI أو رقم الجواز' : 'N° NNI ou passeport'}
                          onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_nni: e.target.value }))}
                        />
                      </Col>
                      <Col xs={24} sm={12} md={5}>
                        <FL fr="Nationalité" ar="الجنسية" required />
                        <Select
                          value={currentLigne.cessionnaire_nationalite_id}
                          options={natOptions}
                          placeholder="—"
                          allowClear
                          style={{ width: '100%' }}
                          onChange={v => setCurrentLigne(prev => ({ ...prev, cessionnaire_nationalite_id: v }))}
                        />
                      </Col>
                    </Row>
                  )}

                  {/* ── Champs Personne Morale ───────────────────────────── */}
                  {currentLigne.cessionnaire_type_personne === 'PM' && (
                    <>
                      <Row gutter={[12, 8]}>
                        <Col xs={24} md={10}>
                          <FL fr="Dénomination sociale" ar="التسمية التجارية" required />
                          <Input
                            value={currentLigne.cessionnaire_denomination}
                            placeholder={isAr ? 'اسم الشركة' : 'Dénomination sociale'}
                            onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_denomination: e.target.value }))}
                          />
                        </Col>
                        <Col xs={12} md={7}>
                          <FL fr="Forme juridique" ar="الشكل القانوني" required />
                          <Input
                            value={currentLigne.cessionnaire_forme_juridique}
                            placeholder={isAr ? 'مثل: SARL، SA…' : 'Ex : SARL, SA, GIE…'}
                            onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_forme_juridique: e.target.value }))}
                          />
                        </Col>
                        <Col xs={12} md={7}>
                          <FL fr="N° identification (RCCM / autre)" ar="رقم التعريف (سجل تجاري / آخر)" required />
                          <Input
                            value={currentLigne.cessionnaire_num_identification}
                            placeholder={isAr ? 'رقم التسجيل' : 'N° RCCM ou identification'}
                            onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_num_identification: e.target.value }))}
                          />
                        </Col>
                      </Row>
                      <Row gutter={[12, 8]} style={{ marginTop: 8 }}>
                        <Col xs={12} md={8}>
                          <FL fr="Nationalité / Pays d'origine" ar="الجنسية / بلد المنشأ" required />
                          <Input
                            value={currentLigne.cessionnaire_nationalite_pm}
                            placeholder={isAr ? 'مثال: موريتانيا، فرنسا…' : 'Ex : Mauritanie, France…'}
                            onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_nationalite_pm: e.target.value }))}
                          />
                        </Col>
                        <Col xs={24} md={16}>
                          <FL fr="Siège social" ar="المقر الاجتماعي" required />
                          <Input
                            value={currentLigne.cessionnaire_siege_social}
                            placeholder={isAr ? 'عنوان المقر' : 'Adresse du siège social'}
                            onChange={e => setCurrentLigne(prev => ({ ...prev, cessionnaire_siege_social: e.target.value }))}
                          />
                        </Col>
                      </Row>
                    </>
                  )}

                  {/* Statut complétude identité (feedback temps réel) */}
                  {currentLigne.cessionnaire_type === 'NOUVEAU' && (() => {
                    if (currentManquants.length === 0) {
                      return (
                        <Alert type="success" showIcon style={{ marginTop: 10, padding: '4px 12px' }}
                          message={isAr ? '✔ هوية مكتملة' : '✔ Identité complète'} />
                      );
                    }
                    return (
                      <Alert type="warning" showIcon style={{ marginTop: 10, padding: '4px 12px' }}
                        message={
                          isAr
                            ? `الحقول الناقصة : ${currentManquants.join('، ')}`
                            : `Champs manquants : ${currentManquants.join(', ')}`
                        } />
                    );
                  })()}

                  {/* Parts + Ajouter (NOUVEAU) */}
                  <Row gutter={[12, 8]} style={{ marginTop: 12 }} align="bottom">
                    <Col xs={12} md={5}>
                      <FL fr="Parts cédées" ar="الحصص المتنازَل عنها" required />
                      <InputNumber
                        value={currentLigne.nombre_parts}
                        min={1} max={disponibles > 0 ? disponibles : undefined}
                        style={{ width: '100%' }}
                        placeholder={disponibles > 0 ? `max ${disponibles}` : '0'}
                        onChange={v => setCurrentLigne(prev => ({ ...prev, nombre_parts: v }))}
                      />
                    </Col>
                    <Col xs={12} md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={ajouterLigne}
                        style={currentLigneReady
                          ? { background: '#b45309', borderColor: '#b45309', width: '100%' }
                          : { width: '100%' }}
                        disabled={!currentLigneReady}>
                        {isAr ? 'إضافة السطر' : 'Ajouter la ligne'}
                      </Button>
                    </Col>
                  </Row>
                </div>
              )}
            </Card>

            {/* ── Lignes confirmées ──────────────────────────────────────────── */}
            {lignes.length > 0 && (
              <Card
                size="small"
                style={{ marginBottom: 16, borderLeft: '4px solid #059669' }}
                title={
                  <span style={{ color: '#059669' }}>
                    {isAr ? 'سطور التنازل المؤكدة' : 'Lignes de cession confirmées'}
                    <Tag color="green" style={{ marginLeft: 8 }}>{lignes.length}</Tag>
                  </span>
                }
              >
                <Table
                  dataSource={lignes}
                  columns={lignesColumns}
                  rowKey="_key"
                  pagination={false}
                  size="small"
                  style={{ marginBottom: 12 }}
                />
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.values(cedantsStats).map(stat => {
                    const restantes  = stat.max - stat.total;
                    const estTotal   = restantes === 0;
                    const surCession = restantes < 0;
                    return (
                      <Tag key={stat.nom} color={surCession ? 'error' : estTotal ? 'orange' : 'green'}>
                        {stat.nom} : {stat.total}/{stat.max} {isAr ? 'حصة' : 'parts'}
                        {surCession && ` ⚠ ${isAr ? 'تجاوز' : 'DÉPASSEMENT'} (${-restantes})`}
                        {estTotal   && (isAr ? ' (تنازل كلي — خروج)' : ' (cession totale — sortie)')}
                        {!estTotal && !surCession && ` (${restantes} ${isAr ? 'متبقية' : `restante${restantes > 1 ? 's' : ''}`})`}
                      </Tag>
                    );
                  })}
                </div>
                {hasInvalidLines && (
                  <Alert type="error" showIcon style={{ marginTop: 8 }}
                    message={isAr
                      ? 'بعض سطور التنازل تحتوي على هوية مستفيد غير مكتملة (مُشار إليها بـ ⚠). يرجى حذفها وإعادة إدخالها بالمعلومات الكاملة.'
                      : "Certaines lignes contiennent une identité cessionnaire incomplète (signalées ⚠). Supprimez-les et saisissez-les à nouveau avec l'identité complète."} />
                )}
                {hasOversubscription && (
                  <Alert type="error" showIcon style={{ marginTop: 8 }}
                    message={isAr
                      ? 'بعض المتنازِلين يتنازلون عن حصص تفوق ما يملكون. يرجى التصحيح قبل الإرسال.'
                      : "Certains cédants cèdent plus de parts qu'ils n'en possèdent. Corrigez avant de soumettre."} />
                )}
              </Card>
            )}

            {lignes.length === 0 && (
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message={isAr
                  ? 'لا توجد سطور. استخدم النموذج أعلاه لإضافة سطور التنازل.'
                  : 'Aucune ligne de cession. Utilisez le formulaire ci-dessus pour ajouter des lignes.'} />
            )}

            {/* ── Aperçu répartition ─────────────────────────────────────────── */}
            {preview.length > 0 && (
              <Card title={isAr ? 'معاينة التوزيع بعد التنازل' : 'Aperçu — Répartition après cession'}
                size="small" style={{ marginBottom: 16 }}>
                <Table dataSource={preview} columns={previewColumns}
                  rowKey={r => r.id} pagination={false} size="small" />
              </Card>
            )}

            {/* ── Observations ───────────────────────────────────────────────── */}
            <Card title={isAr ? 'ملاحظات' : 'Observations'} size="small" style={{ marginBottom: 16 }}>
              <Form.Item name="observations">
                <Input.TextArea rows={3}
                  placeholder={isAr ? 'ملاحظات حول عملية التنازل…' : 'Observations sur la cession…'} />
              </Form.Item>
            </Card>

            {/* ── Pièces jointes ─────────────────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <PiecesJointesPending pendingFiles={pendingFiles}
                onAddPending={f => setPendingFiles(prev => [...prev, f])}
                onRemovePending={uid => setPendingFiles(prev => prev.filter(p => p.uid !== uid))} />
            </div>

            <div style={{ textAlign: 'right' }}>
              <Button onClick={() => navigate('/cessions')} style={{ marginRight: 8 }}>
                {isAr ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saveMut.isPending}
                style={{ background: '#1a4480' }}
                disabled={lignes.length === 0 || hasOversubscription || hasInvalidLines}
              >
                {isAr ? 'حفظ كمسودة' : 'Enregistrer en brouillon'}
              </Button>
            </div>
          </Form>
        </Spin>
      )}
    </div>
  );
};

export default FormulaireCession;

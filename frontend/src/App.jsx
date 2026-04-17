import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/Layout/AppLayout';

// Pages
import Login              from './pages/Login/Login';
import Dashboard          from './pages/Dashboard/Dashboard';
import ListeRA            from './pages/Registres/ListeRA';
import DetailRA           from './pages/Registres/DetailRA';
// FormulaireRA supprimé — la création directe en RA est interdite (passe par RC)
import ListeRChrono       from './pages/Registres/ListeRChrono';
import DetailRChrono      from './pages/Registres/DetailRChrono';
import FormulaireRChrono  from './pages/Registres/FormulaireRChrono';
// RectifierRChrono supprimé — la rectification réutilise FormulaireRChrono (mode /:id/rectifier)
import ListeRBE               from './pages/RBE/ListeRBE';
import DetailRBE              from './pages/RBE/DetailRBE';
import FormulaireRBE          from './pages/RBE/FormulaireRBE';
import FormulaireModificationRBE from './pages/RBE/FormulaireModificationRBE';
import FormulaireRadiationRBE    from './pages/RBE/FormulaireRadiationRBE';
import RapportRBE                from './pages/RBE/RapportRBE';
import ListeDemandes      from './pages/Demandes/ListeDemandes';
import DetailDemande      from './pages/Demandes/DetailDemande';
import FormulaireDemande  from './pages/Demandes/FormulaireDemande';
import ListeDepots        from './pages/Depots/ListeDepots';
import FormulaireDepot    from './pages/Depots/FormulaireDepot';
import DetailDepot         from './pages/Depots/DetailDepot';
import ListeModifications      from './pages/Modifications/ListeModifications';
import FormulaireModification  from './pages/Modifications/FormulaireModification';
import DetailModification      from './pages/Modifications/DetailModification';
import ListeRadiations         from './pages/Radiations/ListeRadiations';
import FormulaireRadiation     from './pages/Radiations/FormulaireRadiation';
import DetailRadiation         from './pages/Radiations/DetailRadiation';
import ListeCessions           from './pages/Cessions/ListeCessions';
import FormulaireCession       from './pages/Cessions/FormulaireCession';
import DetailCession           from './pages/Cessions/DetailCession';
import ListeCessionsFonds      from './pages/CessionsFonds/ListeCessionsFonds';
import FormulaireCessionFonds  from './pages/CessionsFonds/FormulaireCessionFonds';
import DetailCessionFonds      from './pages/CessionsFonds/DetailCessionFonds';
import RecherchePage      from './pages/Recherche/RecherchePage';
import JournalPage        from './pages/Journal/JournalPage';
import ListeHistorique    from './pages/Historique/ListeHistorique';
import FormulaireHistorique from './pages/Historique/FormulaireHistorique';
import DetailHistorique   from './pages/Historique/DetailHistorique';
import ImportHistorique   from './pages/Historique/ImportHistorique';
import RapportsPage       from './pages/Rapports/RapportsPage';
import ListeAutorisations from './pages/Autorisations/ListeAutorisations';
import MesAutorisations   from './pages/Autorisations/MesAutorisations';
import ListeCertificats   from './pages/Certificats/ListeCertificats';
import Utilisateurs       from './pages/Administration/Utilisateurs';
import Parametrage        from './pages/Administration/Parametrage';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}><Spin size="large" /></div>;
  return user ? children : <Navigate to="/login" replace />;
};

/** Route réservée au greffier — redirige vers "/" si l'utilisateur est un agent. */
const GreffierRoute = ({ children }) => {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return hasRole('GREFFIER') ? children : <Navigate to="/" replace />;
};

/** Route interdite à l'Agent GU — réservée au greffier et à l'agent tribunal. */
const TribunalRoute = ({ children }) => {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (hasRole('GREFFIER') || hasRole('AGENT_TRIBUNAL')) ? children : <Navigate to="/registres/chronologique" replace />;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}><Spin size="large" /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />

        {/* Registre Analytique — accès réservé au greffier */}
        <Route path="registres/analytique"         element={<GreffierRoute><ListeRA /></GreffierRoute>} />
        <Route path="registres/analytique/nouveau" element={<Navigate to="/registres/chronologique/nouveau" replace />} />
        <Route path="registres/analytique/:id"     element={<GreffierRoute><DetailRA /></GreffierRoute>} />
        <Route path="registres/chronologique"                    element={<ListeRChrono />} />
        <Route path="registres/chronologique/nouveau"          element={<FormulaireRChrono />} />
        <Route path="registres/chronologique/:id"              element={<DetailRChrono />} />
        <Route path="registres/chronologique/:id/rectifier"    element={<FormulaireRChrono />} />

        {/* Bénéficiaires Effectifs */}
        <Route path="registres/rbe"                element={<ListeRBE />} />
        <Route path="registres/rbe/nouvelle"       element={<FormulaireRBE />} />
        <Route path="registres/rbe/:id"            element={<DetailRBE />} />
        <Route path="registres/rbe/:id/modifier"   element={<FormulaireModificationRBE />} />
        <Route path="registres/rbe/:id/radier"     element={<FormulaireRadiationRBE />} />
        <Route path="registres/rbe/rapport"        element={<RapportRBE />} />

        {/* Demandes — interdites à l'Agent GU */}
        <Route path="demandes"           element={<TribunalRoute><ListeDemandes /></TribunalRoute>} />
        <Route path="demandes/nouvelle"  element={<TribunalRoute><FormulaireDemande /></TribunalRoute>} />
        <Route path="demandes/:id"       element={<TribunalRoute><DetailDemande /></TribunalRoute>} />

        {/* Dépôts */}
        <Route path="depots"                element={<ListeDepots />} />
        <Route path="depots/nouveau"        element={<FormulaireDepot />} />
        <Route path="depots/:id"            element={<DetailDepot />} />
        <Route path="depots/:id/modifier"   element={<FormulaireDepot />} />

        {/* Modifications */}
        <Route path="modifications"                  element={<ListeModifications />} />
        <Route path="modifications/nouvelle"         element={<FormulaireModification />} />
        <Route path="modifications/:id"              element={<DetailModification />} />
        <Route path="modifications/:id/modifier"     element={<FormulaireModification />} />
        <Route path="modifications/:id/corriger"     element={<FormulaireModification />} />

        {/* Radiations */}
        <Route path="radiations"                    element={<ListeRadiations />} />
        <Route path="radiations/nouvelle"           element={<FormulaireRadiation />} />
        <Route path="radiations/:id"                element={<DetailRadiation />} />

        {/* Cessions (parts) */}
        <Route path="cessions"                       element={<ListeCessions />} />
        <Route path="cessions/nouvelle"              element={<FormulaireCession />} />
        <Route path="cessions/:id"                   element={<DetailCession />} />
        <Route path="cessions/:id/modifier"          element={<FormulaireCession />} />
        <Route path="cessions/:id/corriger"          element={<FormulaireCession />} />

        {/* Cessions de fonds de commerce (PH) */}
        <Route path="cessions-fonds"                      element={<ListeCessionsFonds />} />
        <Route path="cessions-fonds/nouvelle"             element={<FormulaireCessionFonds />} />
        <Route path="cessions-fonds/:id"                  element={<DetailCessionFonds />} />
        <Route path="cessions-fonds/:id/modifier"         element={<FormulaireCessionFonds />} />

        {/* Recherche & Rapports */}
        <Route path="recherche" element={<RecherchePage />} />
        <Route path="rapports"  element={<RapportsPage />} />

        {/* Journal d'audit */}
        <Route path="journal"   element={<JournalPage />} />

        {/* Autorisations — greffier (file d'attente) */}
        <Route path="autorisations"     element={<GreffierRoute><ListeAutorisations /></GreffierRoute>} />
        {/* Mes autorisations — agents (suivi de leurs propres demandes) */}
        <Route path="mes-autorisations" element={<PrivateRoute><MesAutorisations /></PrivateRoute>} />

        {/* Certificats déclaratifs du greffier */}
        <Route path="certificats" element={<PrivateRoute><ListeCertificats /></PrivateRoute>} />

        {/* Immatriculations historiques */}
        <Route path="historique"              element={<ListeHistorique />} />
        <Route path="historique/nouveau"      element={<FormulaireHistorique />} />
        <Route path="historique/import"       element={<GreffierRoute><ImportHistorique /></GreffierRoute>} />
        <Route path="historique/:id"          element={<DetailHistorique />} />
        <Route path="historique/:id/modifier" element={<FormulaireHistorique />} />

        {/* Administration */}
        <Route path="administration/utilisateurs" element={<Utilisateurs />} />
        <Route path="administration/parametrage"  element={<Parametrage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);

export default App;

import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ItemsPage from './pages/ItemsPage';
import PlansPage from './pages/PlansPage';
import PlanEditorPage from './pages/PlanEditorPage';
import PlayModePage from './pages/PlayModePage';
import TemplatesPage from './pages/TemplatesPage';
import TemplateEditorPage from './pages/TemplateEditorPage';
import TripsPage from './pages/TripsPage';
import TripViewPage from './pages/TripViewPage';
import TripPlayPage from './pages/TripPlayPage';
import ImportExportPage from './pages/ImportExportPage';
import ScanPage from './pages/ScanPage';
import SearchPage from './pages/SearchPage';

export default function App() {
  return (
    <Routes>
      <Route path="/scan/:planId/:nodeId" element={<ScanPage />} />
      <Route path="/play/:id" element={<PlayModePage />} />
      <Route path="/trips/:id/play" element={<TripPlayPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/plans/:id" element={<PlanEditorPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:id" element={<TemplateEditorPage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripViewPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/data" element={<ImportExportPage />} />
      </Route>
    </Routes>
  );
}

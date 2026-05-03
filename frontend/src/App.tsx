import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SearchPage } from './pages/SearchPage';
import { ListsPage } from './pages/ListsPage';
import { BuildIndexPage } from './pages/BuildIndexPage';
import { ScreeningIntakePage } from './pages/ScreeningIntakePage';
import { ScreeningDetailPage } from './pages/ScreeningDetailPage';
import { CriteriaAnalysisPage } from './pages/CriteriaAnalysisPage';
import { LLMScreeningPage } from './pages/LLMScreeningPage';
import { StepsPage } from './pages/StepsPage';
import { StartScreeningPage } from './pages/StartScreeningPage';
import { OutputCompilationPage } from './pages/OutputCompilationPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/steps" replace />} />
        <Route path="/steps" element={<StepsPage />} />
        <Route path="/start-screening" element={<StartScreeningPage />} />
        <Route path="/screenings/new" element={<ScreeningIntakePage />} />
        <Route path="/screenings/:id" element={<ScreeningDetailPage />} />
        <Route path="/criteria-analysis" element={<CriteriaAnalysisPage />} />
        <Route path="/criteria-analysis/:screeningId" element={<CriteriaAnalysisPage />} />
        {/* Keep old routes for backward compat */}
        <Route path="/llm-chat" element={<Navigate to="/criteria-analysis" replace />} />
        <Route path="/llm-chat/:screeningId" element={<CriteriaAnalysisPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/llm-screening" element={<LLMScreeningPage />} />
        <Route path="/output-compilation" element={<OutputCompilationPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/build-index" element={<BuildIndexPage />} />
      </Route>
    </Routes>
  );
}

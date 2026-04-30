import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SearchPage } from './pages/SearchPage';
import { ListsPage } from './pages/ListsPage';
import { BuildIndexPage } from './pages/BuildIndexPage';
import { ScreeningIntakePage } from './pages/ScreeningIntakePage';
import { ScreeningDetailPage } from './pages/ScreeningDetailPage';
import { LLMChatPage } from './pages/LLMChatPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/screenings/new" element={<ScreeningIntakePage />} />
        <Route path="/screenings/:id" element={<ScreeningDetailPage />} />
        <Route path="/llm-chat" element={<LLMChatPage />} />
        <Route path="/llm-chat/:screeningId" element={<LLMChatPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/build-index" element={<BuildIndexPage />} />
      </Route>
    </Routes>
  );
}

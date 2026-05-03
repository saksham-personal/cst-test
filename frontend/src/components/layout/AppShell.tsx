import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ActiveScreenBar } from './ActiveScreenBar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-surface-1">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Outlet />
        </div>
        <ActiveScreenBar />
      </main>
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-surface-1">
        <Outlet />
      </main>
    </div>
  );
}

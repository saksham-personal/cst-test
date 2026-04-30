import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  children?: ReactNode;
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6 shadow-sm shrink-0">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {children}
      </div>
    </header>
  );
}

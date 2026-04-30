import { Search, List, Database, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useUiStore } from '../../stores/uiStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();

  const navItems = [
    { label: 'Form Intake', icon: FileText, path: '/screenings/new' },
    { label: 'Search', icon: Search, path: '/search' },
    { label: 'Lists', icon: List, path: '/lists' },
    { label: 'Build Index', icon: Database, path: '/build-index' },
  ];

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex h-16 items-center flex-shrink-0 px-4 border-b">
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Search className="size-5" />
          </div>
          {!sidebarCollapsed && (
            <span className="truncate font-semibold text-lg text-sidebar-foreground">Company Screener</span>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const content = (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary border-l-4 border-sidebar-primary'
                    : 'text-sidebar-foreground hover:bg-muted hover:text-sidebar-foreground',
                  sidebarCollapsed ? 'justify-center overflow-hidden' : ''
                )
              }
            >
              <item.icon className="size-5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          );

          if (sidebarCollapsed) {
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger render={content} />
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }
          return content;
        })}
      </nav>

      <div className="p-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className={cn('w-full', sidebarCollapsed ? 'justify-center px-0' : 'justify-start')}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <>
              <ChevronLeft className="mr-2 size-4" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

import { GitBranch, History, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { QrDialog } from '@/components/QrDialog';
import type { Connection } from '@/hooks/useFactory';
import type { Theme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface Props {
  project: string;
  branch: string | null;
  connection: Connection;
  showPrevious: boolean;
  onShowPreviousChange: (value: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  lanUrls: string[];
}

const CONNECTION: Record<Connection, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'bg-status-approved' },
  connecting: { label: 'Reconnecting…', dot: 'bg-amber-500 animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-status-error' },
};

export function Header(props: Props) {
  const conn = CONNECTION[props.connection];
  const ThemeIcon = props.theme === 'dark' ? Moon : props.theme === 'light' ? Sun : Monitor;
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <svg viewBox="0 0 32 32" className="size-4" aria-hidden>
            <path d="M5 26V12l6 3.6V12l6 3.6V12l10 6v8z" fill="currentColor" />
          </svg>
        </div>
        <span className="truncate text-sm font-semibold">{props.project}</span>
        {props.branch && (
          <span className="hidden min-w-0 items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:flex">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{props.branch}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          <History className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous sessions</span>
          <Switch checked={props.showPrevious} onCheckedChange={props.onShowPreviousChange} aria-label="Show tasks from previous sessions" />
        </label>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="grid size-8 place-items-center" role="status" aria-label={conn.label}>
              <span className={cn('size-2 rounded-full', conn.dot)} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{conn.label}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Theme">
              <ThemeIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={props.theme} onValueChange={(v) => props.onThemeChange(v as Theme)}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <QrDialog urls={props.lanUrls} />
      </div>
    </header>
  );
}

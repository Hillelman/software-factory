import type { ColumnId } from '@/lib/types';

export const COLUMN_ACCENT: Record<ColumnId, { dot: string }> = {
  backlog: { dot: 'bg-status-backlog' },
  in_progress: { dot: 'bg-status-progress' },
  error: { dot: 'bg-status-error' },
  approved: { dot: 'bg-status-approved' },
  merged: { dot: 'bg-status-merged' },
};

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskCard } from './TaskCard';
import { Board } from './Board';
import { QrDialog } from './QrDialog';
import { TooltipProvider } from './ui/tooltip';
import { task } from '@/test/fixtures';

const NOW = Date.parse('2026-11-08T10:05:00.000Z');

describe('TaskCard', () => {
  it('shows id, title, current step, elapsed time and tokens', () => {
    render(<TaskCard task={task()} now={NOW} notify onNotifyChange={vi.fn()} onOpen={vi.fn()} showSession={false} />);
    const card = screen.getByRole('button', { name: /T-0001 Add a filter/ });
    expect(within(card).getByText('T-0001')).toBeInTheDocument();
    expect(within(card).getByText('Cleaner')).toBeInTheDocument();
    expect(within(card).getByText('5m 00s')).toBeInTheDocument();
    expect(within(card).getByText('~12k')).toBeInTheDocument();
  });

  it('toggles notifications without opening the drawer', async () => {
    const onOpen = vi.fn();
    const onNotifyChange = vi.fn();
    render(<TaskCard task={task()} now={NOW} notify onNotifyChange={onNotifyChange} onOpen={onOpen} showSession={false} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Notifications for T-0001' }));
    expect(onNotifyChange).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens with the keyboard', async () => {
    const onOpen = vi.fn();
    render(<TaskCard task={task()} now={NOW} notify onNotifyChange={vi.fn()} onOpen={onOpen} showSession={false} />);
    screen.getByRole('button', { name: /T-0001/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('flags slow steps, paused tasks and failures', () => {
    const { rerender } = render(<TaskCard task={task({ stuckLevel: 1 })} now={NOW} notify onNotifyChange={vi.fn()} onOpen={vi.fn()} showSession={false} />);
    expect(screen.getByText('Slow step')).toBeInTheDocument();
    rerender(<TaskCard task={task({ status: 'paused', step: null })} now={NOW} notify onNotifyChange={vi.fn()} onOpen={vi.fn()} showSession={false} />);
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    rerender(
      <TaskCard
        task={task({ status: 'error', step: null, finishedAt: '2026-11-08T10:01:00.000Z', lastError: { step: 'tester', run: 2, message: 'x' } })}
        now={NOW}
        notify
        onNotifyChange={vi.fn()}
        onOpen={vi.fn()}
        showSession
      />,
    );
    expect(screen.getByText('Failed at Tester')).toBeInTheDocument();
    expect(screen.getByText('1m 00s')).toBeInTheDocument();
    expect(screen.getByText('S-20261108-1')).toBeInTheDocument();
  });
});

describe('Board', () => {
  const props = { now: NOW, showSession: false, notifyFor: () => true, onNotifyChange: vi.fn(), onOpen: vi.fn() };

  it('shows an empty state when there are no tasks', () => {
    render(<Board {...props} tasks={[]} />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('renders the five columns with counts', () => {
    render(<Board {...props} tasks={[task(), task({ id: 'T-0002', status: 'merged' })]} />);
    for (const label of ['Backlog', 'In progress', 'Errors', 'Approved', 'Merged']) {
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    }
    expect(within(screen.getByRole('region', { name: 'Merged' })).getByText('T-0002')).toBeInTheDocument();
  });
});

describe('QrDialog', () => {
  it('opens from the phone button and shows the LAN address without the token', async () => {
    render(
      <TooltipProvider>
        <QrDialog urls={['http://192.168.1.20:4317/?t=secret']} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open on your phone' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('http://192.168.1.20:4317/')).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('secret');
  });

  it('explains when no network address is available', async () => {
    render(<QrDialog urls={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open on your phone' }));
    expect(await screen.findByText(/No network address found/)).toBeInTheDocument();
  });
});

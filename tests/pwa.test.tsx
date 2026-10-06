import { afterEach, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
const hook = vi.hoisted(() => ({
  onNeedReload: null as null | (() => void),
  setRefresh: vi.fn(),
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: { onNeedReload: () => void }) => {
    hook.onNeedReload = options.onNeedReload;
    return {
      offlineReady: [false, vi.fn()],
      needRefresh: [true, hook.setRefresh],
      updateServiceWorker: vi.fn(),
    };
  },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/saves">{children}</a>,
}));
vi.mock('../src/persistence/session', () => ({
  autosave: { flush: vi.fn().mockResolvedValue(undefined) },
  errorCode: (error: { code?: string }) => error.code ?? 'storage',
}));
import { useAppStore } from '../src/store';
import { PwaPrompt } from '../src/ui/PwaPrompt';
import type { World } from '../src/model/domain';

afterEach(() => {
  useAppStore.setState({ world: null, activeSave: null, worldJob: null });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('defers actual service-worker activation reload until an unsaved world is protected', async () => {
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  useAppStore.setState({ world: { id: 'unsaved' } as World, activeSave: null, worldJob: null });
  renderToString(<PwaPrompt />);
  hook.onNeedReload!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reload).not.toHaveBeenCalled();
  expect(hook.setRefresh).toHaveBeenCalledWith(true);
  // The controller event's callback remains safe to retry once the world is cleared/saved.
  useAppStore.setState({ world: null });
  hook.onNeedReload!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reload).toHaveBeenCalledOnce();
});

it('preserves a job started after the update request but before service-worker activation', async () => {
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  useAppStore.setState({ world: null, activeSave: null, worldJob: null });
  renderToString(<PwaPrompt />);
  useAppStore.getState().setWorldJob({
    type: 'generate',
    completedWeeks: 0,
    totalWeeks: 1,
    cancelling: false,
  });
  hook.onNeedReload!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reload).not.toHaveBeenCalled();
  expect(hook.setRefresh).toHaveBeenCalledWith(true);
});

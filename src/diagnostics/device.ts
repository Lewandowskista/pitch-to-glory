/**
 * Coarse device facts: enough to compare phones with desktops, too coarse to single one out.
 * Analytics sends them with every event (docs/ANALYTICS.md); a diagnostics export and a bug
 * report name the class and the browser engine.
 */
export interface DeviceContext {
  device_class: 'low' | 'mid' | 'high';
  cores: 2 | 4 | 8 | 16;
  memory?: number;
  viewport: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  input: 'touch' | 'pointer';
}
export function deviceContext(): DeviceContext {
  const cores = navigator.hardwareConcurrency || 0;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const width = window.innerWidth;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const low = cores <= 2 || (memory !== undefined && memory <= 2);
  const high = cores >= 8 && (memory === undefined || memory >= 8);
  return {
    device_class: low ? 'low' : high ? 'high' : 'mid',
    cores: cores <= 2 ? 2 : cores <= 4 ? 4 : cores <= 8 ? 8 : 16,
    ...(memory !== undefined ? { memory: Math.min(memory, 8) } : {}),
    viewport:
      width < 480 ? 'xs' : width < 768 ? 'sm' : width < 1024 ? 'md' : width < 1440 ? 'lg' : 'xl',
    input: coarse ? 'touch' : 'pointer',
  };
}

/** The browser engine family, from the user agent: no version, no platform. */
export function browserEngine(userAgent: string): 'chromium' | 'firefox' | 'webkit' | 'other' {
  if (/Firefox\//.test(userAgent)) return 'firefox';
  if (/Chrom(e|ium)\/|Edg\//.test(userAgent)) return 'chromium';
  if (/AppleWebKit\//.test(userAgent)) return 'webkit';
  return 'other';
}

/** Whether the game runs as an installed app (home screen or desktop window). */
export function installed(): boolean {
  try {
    return (
      (navigator as { standalone?: boolean }).standalone === true ||
      (typeof matchMedia === 'function' &&
        (matchMedia('(display-mode: standalone)').matches ||
          matchMedia('(display-mode: window-controls-overlay)').matches))
    );
  } catch {
    return false;
  }
}

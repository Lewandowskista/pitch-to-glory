import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * The page frame. Its entrance is a CSS animation (styles/shell.css) that starts visible, so
 * the first paint never waits for script; reduced motion turns it off globally.
 */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { pathname } = useLocation();
  return (
    <div
      className={`page ${className}`}
      data-screen={pathname.split('/').filter(Boolean).at(-1) ?? 'menu'}
    >
      {children}
    </div>
  );
}

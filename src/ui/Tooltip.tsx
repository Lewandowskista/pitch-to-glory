import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';

/**
 * A tooltip that works with every input (AGENTS.md §3): it opens on hover and on keyboard
 * focus on desktop, and on a long press on touch screens; tapping elsewhere or Escape closes
 * it. The text is always linked to the trigger with aria-describedby, so screen readers read
 * it without opening anything. Non-interactive triggers become focusable.
 */
export function Tooltip({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const press = useRef<number | undefined>(undefined);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const focusable =
    typeof children.type === 'string' && ['button', 'a', 'input', 'select'].includes(children.type);
  const trigger = cloneElement(children, {
    'aria-describedby': id,
    ...(focusable ? {} : { tabIndex: 0 }),
  });
  return (
    <span
      ref={root}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch') return;
        window.clearTimeout(press.current);
        press.current = window.setTimeout(() => setOpen(true), 450);
      }}
      onPointerUp={() => window.clearTimeout(press.current)}
      onPointerCancel={() => window.clearTimeout(press.current)}
      onContextMenu={(event) => {
        // A long press opens the tooltip rather than the browser's menu.
        if (open) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={
          open
            ? 'pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-[0.5rem] bg-ink px-2.5 py-1.5 text-center text-xs font-semibold normal-case tracking-normal text-bg shadow-surface'
            : 'sr-only'
        }
      >
        {label}
      </span>
    </span>
  );
}

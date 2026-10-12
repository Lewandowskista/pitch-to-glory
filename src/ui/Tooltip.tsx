import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

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
  const bubble = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => () => window.clearTimeout(press.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!root.current || !bubble.current) return;
      const trigger = root.current.getBoundingClientRect();
      const tip = bubble.current.getBoundingClientRect();
      const above = trigger.top - tip.height - 10;
      setPosition({
        top: Math.max(
          8,
          Math.min(window.innerHeight - tip.height - 8, above >= 8 ? above : trigger.bottom + 10),
        ),
        left: Math.max(
          8,
          Math.min(
            window.innerWidth - tip.width - 8,
            trigger.left + (trigger.width - tip.width) / 2,
          ),
        ),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (bubble.current) observer.observe(bubble.current);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, label]);
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
    'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' '),
    ...(focusable ? {} : { tabIndex: 0 }),
  });
  const content = (
    <span
      ref={bubble}
      role="tooltip"
      id={id}
      style={
        open
          ? {
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }
          : undefined
      }
      className={
        open
          ? 'pointer-events-none fixed z-50 w-max max-w-[min(16rem,calc(100vw-1rem))] rounded-control border border-line bg-ink px-3 py-2 text-center text-xs leading-relaxed font-semibold normal-case tracking-normal text-bg shadow-surface'
          : 'sr-only'
      }
    >
      {label}
    </span>
  );
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
      {/* Escape the table's scroll clipping and any animated page containing block. A
          tooltip inside a modal stays in that modal's top layer. */}
      {open ? createPortal(content, root.current?.closest('dialog') ?? document.body) : content}
    </span>
  );
}

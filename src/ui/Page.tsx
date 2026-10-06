import { motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../store';
import type { ReactNode } from 'react';
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useAppStore((s) => s.settings.reducedMotion);
  const system = useReducedMotion();
  return (
    <motion.div
      className={`page ${className}`}
      initial={{ opacity: 0, y: reduced || system ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced || system ? 0 : 0.18 }}
    >
      {children}
    </motion.div>
  );
}

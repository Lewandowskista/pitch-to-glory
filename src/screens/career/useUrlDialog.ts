import { useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * A dialog whose open state lives in the URL, so browser back closes it and a refresh
 * keeps it open. Returns the current value and open/close actions.
 */
export function useUrlDialog(key: string): {
  value: string | null;
  open: (value?: string) => void;
  close: () => void;
} {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pushed = useRef(false);
  return {
    value: params.get(key),
    open: (value = '1') => {
      pushed.current = true;
      const next = new URLSearchParams(params);
      next.set(key, value);
      setParams(next);
    },
    close: () => {
      if (pushed.current) {
        pushed.current = false;
        navigate(-1);
      } else {
        const next = new URLSearchParams(params);
        next.delete(key);
        setParams(next, { replace: true });
      }
    },
  };
}

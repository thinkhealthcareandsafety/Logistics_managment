import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * The thin animated bar across the top while something is loading for the first time
 * or saving. Background refreshes (lists re-checked every minute) don't count, so it
 * never flickers on its own. A short delay keeps instant answers from flashing it.
 */
export function TopProgress({ force = false }: { force?: boolean }) {
  const loading = useIsFetching({ predicate: (q) => q.state.status === 'pending' }) > 0;
  const saving = useIsMutating() > 0;
  const busy = force || loading || saving;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, [busy]);

  if (!show) return null;
  return <div className="top-progress" role="progressbar" aria-label="Loading" />;
}

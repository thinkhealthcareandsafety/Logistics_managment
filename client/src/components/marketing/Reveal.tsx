import clsx from 'clsx';
import { useInView } from '../../hooks/useInView';

/**
 * Fades content up the first time it scrolls into view. The motion itself lives in
 * `.reveal` in styles/index.css, which drops it entirely under reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** ms - for staggering siblings, e.g. cells in a grid. */
  delay?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true, rootMargin: '0px 0px -8% 0px' });

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={clsx('reveal', inView && 'reveal-in', className)}
    >
      {children}
    </div>
  );
}

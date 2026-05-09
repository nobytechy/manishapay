/**
 * Fades + slides children in from below when they enter the viewport.
 * Uses IntersectionObserver — no animation library needed.
 *
 *   <FadeInOnScroll delay={100}>
 *     <Card .../>
 *   </FadeInOnScroll>
 */
import { useEffect, useRef, useState } from 'react';

export default function FadeInOnScroll({
  children,
  className = '',
  delay = 0,
  rootMargin = '0px 0px -10% 0px',
  as: Tag = 'div',
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <Tag
      ref={ref}
      className={`transition-all duration-700 ease-out will-change-transform motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

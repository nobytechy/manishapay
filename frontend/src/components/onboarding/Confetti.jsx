import { useEffect, useRef } from 'react';

/*
 * Tiny, dependency-free canvas confetti burst. Renders full-screen, non-interactive,
 * and self-clears after `duration`. Used for the activation celebration.
 */
export default function Confetti({ duration = 2600, count = 150 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let w, h;
    const resize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();

    const colors = ['#22a65a', '#2166c4', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981'];
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * -h * 0.4,
      r: (Math.random() * 5 + 4) * dpr,
      c: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 2.4 * dpr,
      vy: (Math.random() * 3 + 2.5) * dpr,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
    }));

    const start = performance.now();
    let raf;
    const tick = (now) => {
      ctx.clearRect(0, 0, w, h);
      const t = now - start;
      const fade = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04 * dpr; p.rot += p.vrot;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [duration, count]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true" />;
}

/**
 * Faint floating technology backdrop for the landing hero.
 *
 * Renders a layer of slowly drifting / rotating shapes and tech icons in the
 * brand emerald tint. Designed to be visible without competing with the hero
 * text — opacity stays low (5–18%) and motion is slow (20–55 second cycles).
 *
 * Usage:  drop inside a relatively-positioned parent (the hero section).
 *         Wrap hero content in `relative z-10` so it stacks above this layer.
 */
import { Code2, Terminal, Webhook, Lock, Zap, Database, Cpu, GitBranch } from 'lucide-react';

const ANIM_KEYFRAMES = `
  @keyframes mp-drift-a {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(22px, -28px) rotate(180deg); }
  }
  @keyframes mp-drift-b {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(-18px, 30px) rotate(-160deg); }
  }
  @keyframes mp-drift-c {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(15px, -18px); }
  }
  @keyframes mp-drift-d {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-25px, -15px); }
  }
  @keyframes mp-spin-slow {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes mp-pulse-soft {
    0%, 100% { opacity: 0.06; }
    50% { opacity: 0.16; }
  }
  @keyframes mp-pulse-medium {
    0%, 100% { opacity: 0.10; }
    50% { opacity: 0.22; }
  }
  @keyframes mp-pulse-icon {
    0%, 100% { opacity: 0.04; }
    50% { opacity: 0.13; }
  }
`;

// Hexagon SVG, brand-tinted, sized via parent
function Hexagon({ size = 80, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`absolute text-brand ${className}`}
      style={style}
      aria-hidden="true"
    >
      <polygon
        points="50,5 93,28 93,72 50,95 7,72 7,28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

// Concentric circle, brand-tinted
function CircleRing({ size = 60, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`absolute text-brand ${className}`}
      style={style}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

// Small filled brand dot — use sparingly as accents
function Dot({ size = 6, className = '', style = {} }) {
  return (
    <span
      className={`absolute rounded-full bg-brand ${className}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    />
  );
}

export default function TechBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <style>{ANIM_KEYFRAMES}</style>

      {/* Geometric shapes */}
      <Hexagon
        size={120}
        className="top-[12%] left-[4%]"
        style={{ animation: 'mp-drift-a 38s ease-in-out infinite, mp-pulse-soft 9s ease-in-out infinite' }}
      />
      <Hexagon
        size={70}
        className="top-[58%] right-[6%]"
        style={{ animation: 'mp-drift-b 32s ease-in-out infinite, mp-pulse-medium 11s ease-in-out infinite' }}
      />
      <CircleRing
        size={90}
        className="top-[8%] right-[8%]"
        style={{ animation: 'mp-drift-c 28s ease-in-out infinite, mp-pulse-soft 7s ease-in-out infinite' }}
      />
      <CircleRing
        size={55}
        className="top-[68%] left-[10%]"
        style={{ animation: 'mp-drift-d 24s ease-in-out infinite, mp-pulse-medium 10s ease-in-out infinite' }}
      />

      {/* Tech icons (lucide) drifting and rotating */}
      <Code2
        size={42}
        className="absolute top-[22%] right-[25%] text-brand"
        style={{
          animation: 'mp-drift-c 30s ease-in-out infinite, mp-pulse-icon 6s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <Terminal
        size={36}
        className="absolute top-[42%] left-[18%] text-brand"
        style={{
          animation: 'mp-drift-b 36s ease-in-out infinite, mp-pulse-icon 7s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <Webhook
        size={38}
        className="absolute top-[78%] left-[42%] text-brand"
        style={{
          animation: 'mp-drift-a 34s ease-in-out infinite, mp-pulse-icon 8s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <Lock
        size={32}
        className="absolute top-[35%] right-[14%] text-brand"
        style={{
          animation: 'mp-drift-d 40s ease-in-out infinite, mp-pulse-icon 9s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <Database
        size={34}
        className="absolute top-[80%] right-[28%] text-brand"
        style={{
          animation: 'mp-drift-c 26s ease-in-out infinite, mp-pulse-icon 10s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <Cpu
        size={36}
        className="absolute top-[14%] left-[38%] text-brand"
        style={{
          animation: 'mp-spin-slow 55s linear infinite, mp-pulse-icon 12s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <GitBranch
        size={30}
        className="absolute top-[62%] left-[28%] text-brand"
        style={{
          animation: 'mp-drift-a 42s ease-in-out infinite, mp-pulse-icon 9s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <Zap
        size={28}
        className="absolute top-[5%] left-[55%] text-brand"
        style={{
          animation: 'mp-drift-b 30s ease-in-out infinite, mp-pulse-icon 6s ease-in-out infinite',
        }}
        aria-hidden="true"
      />

      {/* Accent dots — tiny brand specks */}
      <Dot size={5} className="top-[18%] left-[68%]" style={{ animation: 'mp-pulse-medium 4s ease-in-out infinite' }} />
      <Dot size={4} className="top-[48%] right-[40%]" style={{ animation: 'mp-pulse-soft 6s ease-in-out infinite' }} />
      <Dot size={6} className="top-[72%] left-[60%]" style={{ animation: 'mp-pulse-medium 5s ease-in-out infinite' }} />
      <Dot size={4} className="top-[32%] left-[8%]" style={{ animation: 'mp-pulse-soft 7s ease-in-out infinite' }} />
      <Dot size={5} className="top-[88%] left-[15%]" style={{ animation: 'mp-pulse-medium 5s ease-in-out infinite' }} />
    </div>
  );
}

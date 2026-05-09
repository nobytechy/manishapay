/**
 * Faint floating technology backdrop spanning the entire landing page.
 *
 * Renders three layers:
 *   1. Large geometric shapes (hexagons, concentric ring circles) — slowest motion, lowest opacity
 *   2. Tech icons (lucide) — clustered thematically near related sections
 *   3. Accent dots — small bright specks adding life
 *
 * Plus a few large soft brand-tinted blurs as ambient haze.
 *
 * All motion uses transform + opacity only (GPU-accelerated). Opacity stays
 * 4–22% so the backdrop reads as ambience, not decoration that competes
 * with content. Animation cycles are 24–60 seconds so motion is calm.
 *
 * Usage:  drop inside a relatively-positioned parent with overflow-hidden.
 *         Wrap page content in `relative z-10` so it stacks above this layer.
 */
import {
  Code2, Terminal, Webhook, Lock, Zap, Database, Cpu, GitBranch,
  ShieldCheck, Server, Workflow, KeyRound,
} from 'lucide-react';

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
  @keyframes mp-drift-e {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(28px, 20px) rotate(120deg); }
  }
  @keyframes mp-drift-f {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(-22px, -22px) rotate(-90deg); }
  }
  @keyframes mp-spin-slow {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes mp-spin-reverse {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(-360deg); }
  }
  @keyframes mp-pulse-soft   { 0%, 100% { opacity: 0.05; } 50% { opacity: 0.14; } }
  @keyframes mp-pulse-medium { 0%, 100% { opacity: 0.08; } 50% { opacity: 0.20; } }
  @keyframes mp-pulse-icon   { 0%, 100% { opacity: 0.04; } 50% { opacity: 0.13; } }
  @keyframes mp-pulse-dot    { 0%, 100% { opacity: 0.20; } 50% { opacity: 0.55; } }
`;

// ── Element catalogue ─────────────────────────────────────────────
// Each entry placed at top: <%> of total page height. Spread covers
// the whole document so motion is constant as the user scrolls.

const SHAPES = [
  // Hero band
  { type: 'hex',    size: 120, top: '3%',  left: '4%',   drift: 'a', driftDur: 38, pulse: 'soft',    pulseDur: 9 },
  { type: 'circle', size: 90,  top: '5%',  right: '8%',  drift: 'c', driftDur: 28, pulse: 'soft',    pulseDur: 7 },
  { type: 'hex',    size: 60,  top: '10%', left: '42%',  drift: 'e', driftDur: 34, pulse: 'medium',  pulseDur: 8 },
  // Features band
  { type: 'circle', size: 110, top: '20%', right: '5%',  drift: 'b', driftDur: 42, pulse: 'soft',    pulseDur: 11 },
  { type: 'hex',    size: 75,  top: '26%', left: '6%',   drift: 'd', driftDur: 30, pulse: 'medium',  pulseDur: 10 },
  // Quickstart band
  { type: 'hex',    size: 95,  top: '36%', right: '12%', drift: 'f', driftDur: 36, pulse: 'soft',    pulseDur: 9 },
  { type: 'circle', size: 70,  top: '42%', left: '8%',   drift: 'a', driftDur: 32, pulse: 'medium',  pulseDur: 8 },
  // Partners / pricing band
  { type: 'hex',    size: 130, top: '52%', right: '7%',  drift: 'b', driftDur: 44, pulse: 'soft',    pulseDur: 12 },
  { type: 'circle', size: 65,  top: '58%', left: '10%',  drift: 'c', driftDur: 26, pulse: 'medium',  pulseDur: 9 },
  // Security band
  { type: 'hex',    size: 85,  top: '67%', left: '5%',   drift: 'e', driftDur: 38, pulse: 'soft',    pulseDur: 10 },
  { type: 'circle', size: 95,  top: '72%', right: '9%',  drift: 'd', driftDur: 32, pulse: 'medium',  pulseDur: 11 },
  // FAQ + CTA + footer band
  { type: 'hex',    size: 70,  top: '82%', right: '5%',  drift: 'a', driftDur: 30, pulse: 'soft',    pulseDur: 8 },
  { type: 'circle', size: 80,  top: '90%', left: '8%',   drift: 'f', driftDur: 36, pulse: 'medium',  pulseDur: 10 },
  { type: 'hex',    size: 55,  top: '95%', right: '20%', drift: 'b', driftDur: 28, pulse: 'soft',    pulseDur: 7 },
];

const ICONS = [
  // Hero band — variety, "this is a developer product"
  { Icon: Code2,        size: 38, top: '7%',  right: '22%', drift: 'c', driftDur: 30, pulseDur: 6 },
  { Icon: Terminal,     size: 34, top: '14%', left: '20%',  drift: 'b', driftDur: 36, pulseDur: 7 },
  { Icon: Cpu,          size: 36, top: '4%',  left: '52%',  drift: 'spin', driftDur: 55, pulseDur: 10 },
  { Icon: Zap,          size: 26, top: '17%', left: '58%',  drift: 'b', driftDur: 30, pulseDur: 6 },
  // Features band — workflow, webhook
  { Icon: Workflow,     size: 36, top: '23%', right: '30%', drift: 'a', driftDur: 34, pulseDur: 8 },
  { Icon: Webhook,      size: 34, top: '30%', left: '32%',  drift: 'c', driftDur: 32, pulseDur: 9 },
  { Icon: GitBranch,    size: 30, top: '27%', right: '14%', drift: 'd', driftDur: 28, pulseDur: 7 },
  // Quickstart band — terminal, code
  { Icon: Terminal,     size: 32, top: '38%', right: '38%', drift: 'b', driftDur: 30, pulseDur: 8 },
  { Icon: Code2,        size: 36, top: '45%', left: '40%',  drift: 'spin-r', driftDur: 50, pulseDur: 9 },
  { Icon: Database,     size: 32, top: '48%', right: '18%', drift: 'a', driftDur: 32, pulseDur: 7 },
  // Pricing / partners band — network
  { Icon: Server,       size: 36, top: '55%', left: '32%',  drift: 'c', driftDur: 36, pulseDur: 9 },
  { Icon: KeyRound,     size: 30, top: '60%', right: '32%', drift: 'e', driftDur: 30, pulseDur: 8 },
  // Security band — locks, shields
  { Icon: Lock,         size: 34, top: '68%', right: '24%', drift: 'd', driftDur: 36, pulseDur: 9 },
  { Icon: ShieldCheck,  size: 38, top: '74%', left: '22%',  drift: 'a', driftDur: 40, pulseDur: 10 },
  { Icon: Database,     size: 28, top: '78%', right: '40%', drift: 'b', driftDur: 28, pulseDur: 7 },
  // FAQ / CTA band — varied
  { Icon: Webhook,      size: 32, top: '84%', left: '30%',  drift: 'c', driftDur: 30, pulseDur: 8 },
  { Icon: Cpu,          size: 30, top: '88%', right: '14%', drift: 'spin', driftDur: 45, pulseDur: 9 },
  { Icon: Zap,          size: 28, top: '94%', left: '45%',  drift: 'b', driftDur: 26, pulseDur: 6 },
];

const DOTS = [
  { size: 5, top: '6%',  left: '70%', dur: 4 },
  { size: 4, top: '12%', right: '40%', dur: 6 },
  { size: 5, top: '21%', left: '12%', dur: 5 },
  { size: 4, top: '32%', left: '70%', dur: 7 },
  { size: 6, top: '40%', right: '40%', dur: 5 },
  { size: 4, top: '50%', left: '24%', dur: 6 },
  { size: 5, top: '62%', right: '50%', dur: 4 },
  { size: 4, top: '70%', left: '40%', dur: 7 },
  { size: 6, top: '79%', right: '8%',  dur: 5 },
  { size: 4, top: '86%', left: '60%', dur: 6 },
  { size: 5, top: '92%', right: '34%', dur: 5 },
];

// Soft ambient brand-tinted blurs for haze. Large, very low opacity, very slow drift.
const HAZE = [
  { size: 600, top: '2%',  left: '-10%', dur: 40, opacity: 0.08 },
  { size: 500, top: '30%', right: '-15%', dur: 48, opacity: 0.06 },
  { size: 700, top: '60%', left: '-20%', dur: 55, opacity: 0.05 },
  { size: 550, top: '85%', right: '-10%', dur: 44, opacity: 0.07 },
];

// ── Primitive components ──────────────────────────────────────────

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

function HazeBlob({ size, top, left, right, dur, opacity }) {
  return (
    <div
      className="absolute rounded-full bg-brand blur-3xl"
      style={{
        width: size,
        height: size,
        top,
        left,
        right,
        opacity,
        animation: `mp-drift-c ${dur}s ease-in-out infinite`,
      }}
      aria-hidden="true"
    />
  );
}

// Lookup helpers — keep JSX clean
const driftAnim = (kind, dur) => {
  if (kind === 'spin')   return `mp-spin-slow ${dur}s linear infinite`;
  if (kind === 'spin-r') return `mp-spin-reverse ${dur}s linear infinite`;
  return `mp-drift-${kind} ${dur}s ease-in-out infinite`;
};
const pulseAnim = (kind, dur) => `mp-pulse-${kind} ${dur}s ease-in-out infinite`;

// ── Main component ────────────────────────────────────────────────

export default function TechBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <style>{ANIM_KEYFRAMES}</style>

      {/* Layer 0: ambient haze — large soft brand blurs */}
      {HAZE.map((h, i) => (
        <HazeBlob key={`haze-${i}`} {...h} />
      ))}

      {/* Layer 1: geometric shapes */}
      {SHAPES.map((s, i) => {
        const Cmp = s.type === 'hex' ? Hexagon : CircleRing;
        const positionStyle = {
          top: s.top,
          ...(s.left ? { left: s.left } : {}),
          ...(s.right ? { right: s.right } : {}),
        };
        return (
          <Cmp
            key={`shape-${i}`}
            size={s.size}
            style={{
              ...positionStyle,
              animation: `${driftAnim(s.drift, s.driftDur)}, ${pulseAnim(s.pulse, s.pulseDur)}`,
            }}
          />
        );
      })}

      {/* Layer 2: tech icons */}
      {ICONS.map(({ Icon, ...p }, i) => {
        const positionStyle = {
          top: p.top,
          ...(p.left ? { left: p.left } : {}),
          ...(p.right ? { right: p.right } : {}),
        };
        return (
          <Icon
            key={`icon-${i}`}
            size={p.size}
            className="absolute text-brand"
            style={{
              ...positionStyle,
              animation: `${driftAnim(p.drift, p.driftDur)}, mp-pulse-icon ${p.pulseDur}s ease-in-out infinite`,
            }}
            aria-hidden="true"
          />
        );
      })}

      {/* Layer 3: accent dots */}
      {DOTS.map((d, i) => {
        const style = {
          width: d.size,
          height: d.size,
          top: d.top,
          ...(d.left ? { left: d.left } : {}),
          ...(d.right ? { right: d.right } : {}),
          animation: `mp-pulse-dot ${d.dur}s ease-in-out infinite`,
        };
        return (
          <span
            key={`dot-${i}`}
            className="absolute rounded-full bg-brand"
            style={style}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

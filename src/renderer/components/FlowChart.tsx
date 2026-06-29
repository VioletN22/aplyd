import React from 'react';
import { FlowData, FlowNode } from '../../shared/types';

interface FlowChartProps {
  data: FlowData;
  /** 'full' shows labels; 'mini' is a compact preview */
  variant?: 'full' | 'mini';
}

const RANK: Record<string, number> = {
  // 'started' kept for any legacy rows, but 'applied' is the funnel root.
  started: 0,
  applied: 1,
  oa: 2,
  phone_screen: 3,
  interview: 4,
  offer: 5,
  rejected: 99,
  withdrawn: 99,
};
const rank = (s: string) => (s in RANK ? RANK[s] : 50);

const COL = {
  ink: '#111110',
  coral: '#e8927c',
  green: '#2f9e5f',
  red: '#c0563f',
  grey: '#b0aea6',
  muted: '#9a988f',
};

/** Smooth ribbon from a left vertical segment to a right vertical segment. */
function band(x0: number, y0t: number, y0b: number, x1: number, y1t: number, y1b: number): string {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0t} C${mx},${y0t} ${mx},${y1t} ${x1},${y1t} L${x1},${y1b} C${mx},${y1b} ${mx},${y0b} ${x0},${y0b} Z`;
}

interface Band {
  d: string;
  fill: string;
  op: number;
}
interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}
interface Label {
  x: number;
  y: number;
  text: string;
  color: string;
  anchor: 'start' | 'middle' | 'end';
  weight: number;
  size: number;
}

/**
 * "Outcome spine" layout: the active path runs across as a horizontal spine
 * (Started → Applied → … → Offer); rejected/withdrawn applications peel away as
 * downward branches at the exact stage they happened, so drop-off points are
 * obvious and labelled with where they occurred.
 */
function computeLayout(data: FlowData, W: number, H: number, mini: boolean) {
  const marginL = mini ? 16 : 70;
  const marginR = mini ? 64 : 150;
  const spineY = mini ? 26 : 56;
  const SPINE_MAX = mini ? 52 : 116;
  const nodeW = mini ? 4 : 5;
  const dropLead = mini ? 38 : 78;
  const dropZoneTop = spineY + SPINE_MAX + (mini ? 24 : 58);

  const nodes = data.nodes ?? [];
  const links = data.links ?? [];
  const nodeById = new Map<string, FlowNode>(nodes.map((n) => [n.id, n]));
  const out = new Map<string, FlowData['links']>();
  for (const l of links) {
    if (!out.has(l.source)) out.set(l.source, []);
    out.get(l.source)!.push(l);
  }

  const spine = nodes
    .filter((n) => n.kind === 'active' || n.kind === 'offer')
    .sort((a, b) => rank(a.id) - rank(b.id));
  const total = Math.max(1, ...spine.map((n) => n.count));
  const unit = SPINE_MAX / total;

  const span = W - marginR - marginL;
  // One stage only (e.g. everything still at "applied") → center it so it reads
  // as a volume figure rather than a lonely bar on the far left.
  const xs = spine.map((_, i) =>
    spine.length > 1 ? marginL + (i * span) / (spine.length - 1) : W / 2
  );
  const singleNode = spine.length === 1;

  const bands: Band[] = [];
  const bars: Bar[] = [];
  const labels: Label[] = [];

  // Spine nodes + labels
  spine.forEach((n, i) => {
    const h = n.count * unit;
    bars.push({ x: xs[i], y: spineY, w: nodeW, h, color: n.kind === 'offer' ? COL.green : COL.ink });
    if (!mini) {
      const isLast = i === spine.length - 1;
      labels.push({
        x: singleNode ? xs[i] + nodeW / 2 : isLast ? xs[i] + nodeW : xs[i],
        y: spineY - 10,
        text: `${n.label} ${n.count}`,
        color: n.kind === 'offer' ? COL.green : COL.ink,
        anchor: singleNode ? 'middle' : isLast ? 'end' : 'start',
        weight: n.kind === 'offer' ? 700 : 600,
        size: 12.5,
      });
    }
  });

  // Continuing spine bands + downward drop-off branches
  spine.forEach((n, i) => {
    const links = out.get(n.id) || [];
    const next = spine[i + 1];
    const contLink = next ? links.find((l) => l.target === next.id) : undefined;
    const cont = contLink ? contLink.count : 0;

    if (next && cont > 0) {
      const th = cont * unit;
      const toOffer = next.kind === 'offer';
      bands.push({
        d: band(xs[i] + nodeW, spineY, spineY + th, xs[i + 1], spineY, spineY + th),
        fill: toOffer ? COL.green : COL.coral,
        op: toOffer ? 0.42 : 0.34,
      });
    }

    // Drop-offs leave the node below the continuing band, curving down.
    let offset = spineY + cont * unit;
    const drops = links.filter((l) => {
      const t = nodeById.get(l.target);
      return t && (t.kind === 'rejected' || t.kind === 'withdrawn');
    });
    drops.forEach((l) => {
      const t = nodeById.get(l.target)!;
      const th = l.count * unit;
      const srcTop = offset;
      const srcBot = offset + th;
      offset = srcBot;
      const termX = xs[i] + dropLead;
      const termTop = dropZoneTop + i * (mini ? 8 : 14);
      const isRej = t.kind === 'rejected';
      bands.push({
        d: band(xs[i] + nodeW, srcTop, srcBot, termX, termTop, termTop + th),
        fill: isRej ? COL.red : COL.grey,
        op: isRej ? 0.3 : 0.5,
      });
      bars.push({ x: termX, y: termTop, w: nodeW, h: th, color: isRej ? COL.red : COL.grey });
      if (!mini) {
        labels.push({
          x: termX,
          y: termTop + th + 16,
          text: `${isRej ? 'Rejected' : 'Withdrew'} ${l.count}`,
          color: isRej ? COL.red : COL.muted,
          anchor: 'start',
          weight: 700,
          size: 12,
        });
      }
    });
  });

  return { bands, bars, labels };
}

export const FlowChart: React.FC<FlowChartProps> = ({ data, variant = 'full' }) => {
  const mini = variant === 'mini';
  const W = mini ? 380 : 900;
  const H = mini ? 175 : 420;
  const { bands, bars, labels } = computeLayout(data, W, H, mini);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', fontFamily: "-apple-system, 'SF Pro Display', sans-serif" }}
    >
      {bands.map((b, i) => (
        <path key={`b${i}`} d={b.d} fill={b.fill} fillOpacity={b.op} />
      ))}
      {bars.map((n, i) => (
        <rect key={`n${i}`} x={n.x} y={n.y} width={n.w} height={Math.max(1, n.h)} rx={2} fill={n.color} />
      ))}
      {labels.map((t, i) => (
        <text
          key={`l${i}`}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          fill={t.color}
          fontWeight={t.weight}
          textAnchor={t.anchor}
        >
          {t.text}
        </text>
      ))}
    </svg>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// One distinct color per status so the pipeline reads at a glance.
const STATUS: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  applied:      { label: 'Applied',      bg: '#eef2f7', fg: '#475569', dot: '#94a3b8' }, // slate
  oa:           { label: 'OA',           bg: '#fef3c7', fg: '#b45309', dot: '#f59e0b' }, // amber
  phone_screen: { label: 'Phone screen', bg: '#e0f2fe', fg: '#0369a1', dot: '#38bdf8' }, // sky
  interview:    { label: 'Interview',    bg: '#ede9fe', fg: '#6d28d9', dot: '#8b5cf6' }, // purple
  offer:        { label: 'Offer',        bg: '#dcfce7', fg: '#15803d', dot: '#22c55e' }, // green
  rejected:     { label: 'Rejected',     bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444' }, // red
  withdrawn:    { label: 'Withdrawn',    bg: '#f3f4f6', fg: '#6b7280', dot: '#9ca3af' }, // grey
};
const meta = (s: string) =>
  STATUS[s] ?? { label: s.replace(/_/g, ' '), bg: '#eef2f7', fg: '#475569', dot: '#94a3b8' };

interface Props {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export const StatusBadge: React.FC<Props> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cur = meta(value);

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div style={{ display: 'inline-block', marginBottom: '8px' }}>
      <button
        ref={triggerRef}
        type="button"
        title="Change status"
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 8px', backgroundColor: cur.bg, color: cur.fg,
          fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
          fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {cur.label}
        <ChevronDown size={11} style={{ color: cur.fg, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: '180px', zIndex: 1000,
            backgroundColor: 'var(--bg)', border: '1px solid var(--ink)',
            boxShadow: '0 8px 24px rgba(17,17,16,0.18)',
          }}
        >
          {options.map((opt) => {
            const m = meta(opt);
            const isSel = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(opt); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 11px', backgroundColor: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--line)', fontFamily: 'inherit',
                  color: 'var(--ink)', fontWeight: isSel ? 600 : 400, cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--panel)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                <span style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '11px' }}>{m.label}</span>
                {isSel && <Check size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

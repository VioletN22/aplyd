import React, { useEffect, useState } from 'react';
import { FlowData } from '../../shared/types';
import { FlowChart } from '../components/FlowChart';

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: '8px',
};

function pct(n: number, total: number): string {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

interface StatProps {
  label: string;
  value: string;
  sub: string;
  color?: string;
}

const Stat: React.FC<StatProps> = ({ label, value, sub, color }) => (
  <div style={{ flex: 1, padding: '16px 20px', borderRight: '1px solid var(--line)' }}>
    <p style={sectionLabel}>{label}</p>
    <p style={{ fontSize: '26px', fontWeight: 700, color: color || 'var(--ink)', lineHeight: 1.1 }}>
      {value}
    </p>
    <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{sub}</p>
  </div>
);

export const FlowPage: React.FC = () => {
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const flow = await window.electronAPI.flow.getData();
        setData(flow);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flow');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '32px' }}>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '32px' }}>
        <p style={{ fontSize: '13px', color: 'var(--accent)' }}>{error || 'No data'}</p>
      </div>
    );
  }

  const summary = data.summary ?? { total: 0, offers: 0, rejected: 0, withdrawn: 0, inProgress: 0 };
  const hasApps = summary.total > 0;
  const hasTransitions = (data.links ?? []).length > 0;

  return (
    <div style={{ padding: '32px', maxWidth: '1040px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
        Application flow
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '24px' }}>
        How your {summary.total} application{summary.total === 1 ? '' : 's'} move through the pipeline.
      </p>

      {/* Summary strip */}
      <div
        style={{
          display: 'flex',
          border: '1px solid var(--line)',
          marginBottom: '28px',
        }}
      >
        <Stat
          label="Offers"
          value={pct(summary.offers, summary.total)}
          sub={`${summary.offers} reached offer`}
          color="#1a9a50"
        />
        <Stat
          label="Rejected"
          value={pct(summary.rejected, summary.total)}
          sub={`${summary.rejected} rejected`}
          color="#c0392b"
        />
        <Stat
          label="Withdrew"
          value={pct(summary.withdrawn, summary.total)}
          sub={`${summary.withdrawn} withdrew`}
        />
        <div style={{ flex: 1, padding: '16px 20px' }}>
          <p style={sectionLabel}>In progress</p>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>
            {summary.inProgress}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>still active</p>
        </div>
      </div>

      {/* Flow chart */}
      <div
        style={{
          border: '1px solid var(--line)',
          padding: '20px',
          backgroundColor: 'var(--panel)',
          minHeight: '380px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasApps ? (
          <>
            <div style={{ width: '100%' }}>
              <FlowChart data={data} variant="full" />
            </div>
            {!hasTransitions && (
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '16px', textAlign: 'center', maxWidth: '420px' }}>
                Everything's at the applied stage so far. Move applications forward (Interview, Offer…)
                or mark them rejected to watch the flow branch out.
              </p>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: '15px', color: 'var(--ink)', marginBottom: '8px' }}>
              No applications yet
            </p>
            <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '360px' }}>
              Add your first application and it'll show up here as you move it through the pipeline.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

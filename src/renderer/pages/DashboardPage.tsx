import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { JobApplication, FlowData } from '../../shared/types';
import { useApplications } from '../hooks/useApplications';
import { FlowChart } from '../components/FlowChart';
import { Page } from '../components/Navigation';

interface DashboardPageProps {
  onNavigate?: (page: Page) => void;
}

interface DashboardStats {
  total: number;
  byStage: Record<string, number>;
  upcomingDeadlines: number;
  recentApplications: number;
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: '8px',
};

const STAGE_LABEL: Record<string, string> = {
  applied: 'Applied',
  oa: 'OA',
  phone_screen: 'Phone screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
const stageLabel = (s: string) =>
  STAGE_LABEL[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const STAGE_RANK: Record<string, number> = {
  applied: 0,
  oa: 1,
  phone_screen: 2,
  interview: 3,
  offer: 4,
  rejected: 5,
  withdrawn: 6,
};

const Stat: React.FC<{ label: string; value: React.ReactNode; last?: boolean }> = ({
  label,
  value,
  last,
}) => (
  <div style={{ flex: 1, padding: '16px 20px', borderRight: last ? 'none' : '1px solid var(--line)' }}>
    <p style={sectionLabel}>{label}</p>
    <p style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.05 }}>{value}</p>
  </div>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { applications, loading } = useApplications();
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    byStage: {},
    upcomingDeadlines: 0,
    recentApplications: 0,
  });
  const [flow, setFlow] = useState<FlowData | null>(null);

  useEffect(() => {
    window.electronAPI.flow.getData().then(setFlow).catch(() => setFlow(null));
  }, [applications]);

  useEffect(() => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const byStage: Record<string, number> = {};
    let upcomingDeadlines = 0;
    let recentApplications = 0;

    applications.forEach((app: JobApplication) => {
      byStage[app.current_stage] = (byStage[app.current_stage] || 0) + 1;
      if (app.application_deadline) {
        const deadline = new Date(app.application_deadline);
        if (deadline >= now && deadline <= sevenDaysFromNow) upcomingDeadlines++;
      }
      if (new Date(app.created_at) >= sevenDaysAgo) recentApplications++;
    });

    setStats({ total: applications.length, byStage, upcomingDeadlines, recentApplications });
  }, [applications]);

  if (loading) {
    return (
      <div style={{ padding: '32px' }}>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  const sortedStages = Object.entries(stats.byStage).sort(
    (a, b) => (STAGE_RANK[a[0]] ?? 99) - (STAGE_RANK[b[0]] ?? 99)
  );
  const maxStage = Math.max(1, ...sortedStages.map(([, c]) => c));
  const hasTransitions = !!flow && (flow.links ?? []).length > 0;
  const offers = flow?.summary?.offers ?? 0;

  return (
    <div style={{ padding: '32px', maxWidth: '1040px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', marginBottom: '24px' }}>
        Dashboard
      </h1>

      {/* Stat strip */}
      <div style={{ display: 'flex', border: '1px solid var(--line)', marginBottom: '28px' }}>
        <Stat label="Applications" value={stats.total} />
        <Stat label="This week" value={stats.recentApplications} />
        <Stat label="Deadlines (7d)" value={stats.upcomingDeadlines} />
        <Stat
          label="Offers"
          value={<span style={{ color: offers > 0 ? '#1a9a50' : 'var(--ink)' }}>{offers}</span>}
          last
        />
      </div>

      {/* Application flow */}
      <div
        onClick={() => onNavigate?.('flow')}
        style={{
          border: '1px solid var(--line)',
          backgroundColor: 'var(--panel)',
          padding: '20px',
          marginBottom: '28px',
          cursor: 'pointer',
          transition: 'border-color .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <p style={sectionLabel}>Application flow</p>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            View full <ArrowRight size={13} />
          </span>
        </div>
        {hasTransitions ? (
          <div style={{ height: 150 }}>
            <FlowChart data={flow!} variant="mini" />
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: 'var(--muted)', padding: '14px 0 6px' }}>
            {stats.total > 0
              ? `All ${stats.total} at applied. Move applications forward to watch the flow branch out.`
              : 'Add your first application to start the flow.'}
          </p>
        )}
      </div>

      {/* Applications by stage */}
      <div>
        <p style={sectionLabel}>Applications by stage</p>
        {stats.total === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No applications yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            {sortedStages.map(([stage, count]) => (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '120px', fontSize: '13px', color: 'var(--ink)' }}>
                  {stageLabel(stage)}
                </div>
                <div style={{ flex: 1, height: '8px', backgroundColor: 'var(--panel-2, #eae9e3)' }}>
                  <div
                    style={{
                      width: `${(count / maxStage) * 100}%`,
                      height: '100%',
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>
                <div style={{ width: '32px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>
                  {count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

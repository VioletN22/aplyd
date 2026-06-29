import React, { useState } from 'react';
import { MapPin, DollarSign, Calendar, Trash2 } from 'lucide-react';
import { JobApplication } from '../../shared/types';
import { Dialog } from './Dialog';
import { StatusBadge } from './StatusBadge';

interface ApplicationCardProps {
  application: JobApplication;
  onClick: (id: string) => void;
  onDelete?: (id: string) => void;
  stages?: string[]; // selectable stages for this app (incl. rejected/withdrawn)
  onChangeStage?: (id: string, stage: string) => void;
}

const STAGE_LABEL: Record<string, string> = {
  applied: 'Applied', oa: 'OA', phone_screen: 'Phone screen',
  interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
const stageLabel = (s: string) => STAGE_LABEL[s] ?? s.replace(/_/g, ' ');
// Outcome stages get a distinct tint so a dead application reads at a glance.
const stageColors = (s: string): { bg: string; fg: string } => {
  if (s === 'rejected') return { bg: '#fee2e2', fg: '#b91c1c' };
  if (s === 'withdrawn') return { bg: '#f3f4f6', fg: '#6b7280' };
  if (s === 'offer') return { bg: '#dcfce7', fg: '#15803d' };
  return { bg: 'var(--panel)', fg: 'var(--muted)' };
};

export const ApplicationCard: React.FC<ApplicationCardProps> = ({ application, onClick, onDelete, stages, onChangeStage }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const sc = stageColors(application.current_stage);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatSalary = (min: number | null, max: number | null): string => {
    if (!min && !max) return '';
    const minK = min ? `$${Math.round(min / 1000)}k` : '';
    const maxK = max ? `$${Math.round(max / 1000)}k` : '';
    if (minK && maxK) return `${minK} - ${maxK}`;
    return minK || maxK;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete?.(application.id);
  };

  return (
    <div
      style={{
        borderBottom: '1px solid var(--line)',
        paddingBottom: '16px',
        marginBottom: '16px',
        cursor: 'pointer',
        position: 'relative',
        paddingRight: '32px',
      }}
      onClick={() => onClick(application.id)}
      onMouseEnter={(e) => {
        const btn = e.currentTarget.querySelector('button');
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector('button');
        if (btn) btn.style.opacity = '0.3';
      }}
    >
      {/* Delete button */}
      {onDelete && (
        <button
          onClick={handleDelete}
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            padding: '4px 8px',
            backgroundColor: 'transparent',
            color: 'var(--muted)',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.3,
            transition: 'opacity 0.2s',
          }}
          title="Delete application"
        >
          <Trash2 size={16} />
        </button>
      )}

      {/* Stage selector + source, side by side as matching badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        {onChangeStage && stages && stages.length > 0 ? (
          <StatusBadge
            value={application.current_stage}
            options={stages}
            onChange={(s) => onChangeStage(application.id, s)}
          />
        ) : (
          <div
            style={{
              display: 'inline-block', padding: '4px 8px', backgroundColor: sc.bg, color: sc.fg,
              fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px',
            }}
          >
            {stageLabel(application.current_stage)}
          </div>
        )}

        {/* Source badge - same pill design, neutral grey to read as metadata not a stage */}
        {application.job_source && (
          <span
            title="Job source"
            style={{
              display: 'inline-block', padding: '4px 8px',
              backgroundColor: 'var(--panel)', color: 'var(--muted)',
              fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
              fontWeight: 600, marginBottom: '8px',
            }}
          >
            {application.job_source}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--ink)',
          marginTop: '8px',
          marginBottom: '4px',
          paddingRight: '24px',
        }}
      >
        {application.job_title}
      </h3>

      {/* Company */}
      <p
        style={{
          fontSize: '13px',
          color: 'var(--muted)',
          marginBottom: '12px',
        }}
      >
        {application.company}
      </p>

      {/* Location */}
      {application.location && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
          <MapPin size={14} />
          <span>{application.location}</span>
        </div>
      )}

      {/* Salary */}
      {(application.salary_min || application.salary_max) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
          <DollarSign size={14} />
          <span>{formatSalary(application.salary_min, application.salary_max)}</span>
        </div>
      )}

      {/* Application deadline */}
      {application.application_deadline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
          <Calendar size={14} />
          <span>{formatDate(application.application_deadline)}</span>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog
        isOpen={showDeleteDialog}
        title={`Delete application for ${application.job_title}?`}
        message={`This will remove "${application.job_title}" at ${application.company} and all associated data.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
      />
    </div>
  );
};

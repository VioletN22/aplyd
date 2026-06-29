import React, { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Dropdown } from './Dropdown';

interface Filters {
  search?: string;
  stage?: string;
}

interface FilterBarProps {
  onFilterChange: (filters: Filters) => void;
  onAddClick: () => void;
}

const STAGE_OPTIONS = [
  { value: '', label: 'All stages' },
  { value: 'applied', label: 'Applied' },
  { value: 'oa', label: 'OA' },
  { value: 'phone_screen', label: 'Phone screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export const FilterBar: React.FC<FilterBarProps> = ({ onFilterChange, onAddClick }) => {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    onFilterChange({ search: value || undefined, stage: stage || undefined });
  };

  const handleStageChange = (value: string) => {
    setStage(value);
    onFilterChange({ search: search || undefined, stage: value || undefined });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
      {/* Company search */}
      <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
          }}
        />
        <input
          type="text"
          placeholder="Search role, company, keyword…"
          value={search}
          onChange={handleSearchChange}
          style={{
            width: '100%',
            padding: '10px 0 10px 24px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--line)',
            fontSize: '13px',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
      </div>

      {/* Stage filter */}
      <Dropdown
        value={stage}
        options={STAGE_OPTIONS}
        onChange={handleStageChange}
        placeholder="All stages"
        width="180px"
      />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Add button */}
      <button
        onClick={onAddClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'var(--accent)',
          color: '#fff',
          border: 'none',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        <Plus size={14} />
        Add Application
      </button>
    </div>
  );
};

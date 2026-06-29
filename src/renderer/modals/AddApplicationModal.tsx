import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Dropdown } from '../components/Dropdown';
import { JOB_SOURCES } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: any;
  }
}

// "Not specified" first so the field is optional and resettable, then the
// shared list of job sites.
const SOURCE_OPTIONS = [
  { value: '', label: 'Not specified' },
  ...JOB_SOURCES.map((s) => ({ value: s, label: s })),
];

interface AddApplicationModalProps {
  onClose: () => void;
  onSubmit: (jobListing: string, jobSource: string | null) => Promise<void>;
  onQuickAdd?: (company: string, jobTitle: string, jobSource: string | null) => Promise<void>;
  isLoading?: boolean;
}

export const AddApplicationModal: React.FC<AddApplicationModalProps> = ({
  onClose,
  onSubmit,
  onQuickAdd,
  isLoading = false,
}) => {
  const [mode, setMode] = useState<'quick' | 'ai'>('quick');
  const [jobListing, setJobListing] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobSource, setJobSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileUpload = async () => {
    try {
      setError(null);
      const content = await window.electronAPI.selectFile();
      if (content) {
        setJobListing(content);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      setError(errorMessage);
      console.error('Error uploading file:', err);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!company.trim() || !jobTitle.trim()) {
      setError('Please enter both company name and job title');
      return;
    }

    try {
      setIsSubmitting(true);
      if (onQuickAdd) {
        await onQuickAdd(company, jobTitle, jobSource || null);
      }
      setCompany('');
      setJobTitle('');
      setJobSource('');
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      setError(errorMessage);
      console.error('Error adding application:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!jobListing.trim()) {
      setError('Please provide a job listing');
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('Starting Extract with AI...');

      const result = await onSubmit(jobListing, jobSource || null);
      console.log('Extract result:', result);

      setJobListing('');
      setJobSource('');
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      console.error('Error in Extract with AI:', err);
      setError(errorMessage);

      // Show alert for immediate visibility
      setTimeout(() => {
        alert(`Extract with AI Error:\n\n${errorMessage}\n\nPlease check Settings > Claude AI Setup or try Quick Add instead.`);
      }, 100);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <h1 className="modal-title">Add Job Application</h1>
          <button onClick={onClose} className="modal-close" style={{ padding: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 24px' }}>
          <button
            onClick={() => setMode('quick')}
            className={`navlink ${mode === 'quick' ? 'active' : ''}`}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '12px 16px',
              marginBottom: 0,
              borderBottom: mode === 'quick' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Quick Add
          </button>
          <button
            onClick={() => setMode('ai')}
            className={`navlink ${mode === 'ai' ? 'active' : ''}`}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '12px 16px',
              marginBottom: 0,
              borderBottom: mode === 'ai' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Extract with AI
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#fee', borderLeft: '3px solid var(--accent)', marginBottom: '16px', color: 'var(--accent)', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {mode === 'quick' ? (
            // Quick Add Form
            <form onSubmit={handleQuickAdd}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Company Name
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g., Google, Microsoft, Apple"
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--ink)',
                    backgroundColor: 'transparent',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Job Title/Role
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g., Senior Software Engineer"
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--ink)',
                    backgroundColor: 'transparent',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Job Source <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--faint)' }}>· optional</span>
                </label>
                <Dropdown
                  value={jobSource}
                  options={SOURCE_OPTIONS}
                  onChange={setJobSource}
                  placeholder="Where did you find it?"
                />
              </div>

              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' }}>
                You can add the job description, link, and other details after creation. Claude will help fill in the context.
              </p>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  style={{ flex: 1, marginRight: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="accent"
                  style={{ flex: 1 }}
                  disabled={isSubmitting || isLoading}
                >
                  {isSubmitting || isLoading ? 'Adding...' : 'Quick Add'}
                </button>
              </div>
            </form>
          ) : (
            // AI Extract Form
            <>
              {isSubmitting && (
                <div style={{ padding: '24px', textAlign: 'center', backgroundColor: 'var(--panel)', borderRadius: '4px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Extracting job details...</div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></div>
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite 0.3s' }}></div>
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite 0.6s' }}></div>
                  </div>
                  <style>{`
                    @keyframes pulse {
                      0%, 100% { opacity: 0.3; }
                      50% { opacity: 1; }
                    }
                  `}</style>
                </div>
              )}
              <form onSubmit={handleAISubmit} style={{ display: isSubmitting ? 'none' : 'block' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Job Listing
                </label>
                <textarea
                  value={jobListing}
                  onChange={(e) => setJobListing(e.target.value)}
                  placeholder="Paste the job listing here, or upload a screenshot/PDF..."
                  style={{
                    width: '100%',
                    height: '240px',
                    padding: '12px',
                    backgroundColor: 'var(--panel)',
                    border: '1px solid var(--line)',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <button
                  type="button"
                  onClick={handleFileUpload}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--line)',
                    fontSize: '11px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  Upload File
                </button>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Job Source <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--faint)' }}>· optional</span>
                </label>
                <Dropdown
                  value={jobSource}
                  options={SOURCE_OPTIONS}
                  onChange={setJobSource}
                  placeholder="Where did you find it? (AI will guess if left blank)"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  style={{ flex: 1, marginRight: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="accent"
                  style={{ flex: 1 }}
                  disabled={isSubmitting || isLoading}
                >
                  {isSubmitting || isLoading ? 'Extracting...' : 'Extract with AI'}
                </button>
              </div>
            </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

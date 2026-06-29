import React, { useState, useEffect } from 'react';
import { FilterBar } from '../components/FilterBar';
import { ApplicationCard } from '../components/ApplicationCard';
import { AddApplicationModal } from '../modals/AddApplicationModal';
import { Dialog } from '../components/Dialog';
import { useApplications } from '../hooks/useApplications';
import { Workflow } from '../../shared/types';

// Outcome stages every application can move to, on top of its workflow path.
const OUTCOME_STAGES = ['rejected', 'withdrawn'];

interface Filters {
  search?: string;
  stage?: string;
}

interface ListPageProps {
  onSelectApplication: (id: string) => void;
}

export const ListPage: React.FC<ListPageProps> = ({ onSelectApplication }) => {
  const { applications, loading, refresh, patch } = useApplications();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    window.electronAPI.db.getAllWorkflows().then(setWorkflows).catch(() => {});
  }, []);

  // The stages a given application can be set to: its workflow path + outcomes,
  // and always include its current stage so the select can display it.
  const stagesForApp = (workflowId: string | null, currentStage: string): string[] => {
    const wf = workflows.find((w) => w.id === workflowId);
    const base = wf?.stages ?? ['applied', 'oa', 'phone_screen', 'interview', 'offer'];
    return Array.from(new Set([...base, ...OUTCOME_STAGES, currentStage]));
  };

  const handleChangeStage = async (applicationId: string, stage: string) => {
    // Optimistic in-place update - keeps scroll position (no full reload).
    patch(applicationId, { current_stage: stage });
    try {
      await window.electronAPI.db.createStageHistory(applicationId, stage);
      await window.electronAPI.db.updateApplication(applicationId, { current_stage: stage });
    } catch (err) {
      await refresh(); // revert to server truth on failure
      setErrorDialog({
        title: 'Error Updating Status',
        message: err instanceof Error ? err.message : 'Failed to update status',
      });
    }
  };

  // Filtering is done client-side (instant, fuzzy, multi-field) - no DB round-trip
  // per keystroke. We keep the full list loaded and narrow it in `filteredApplications`.
  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
  };

  const handleAddClick = () => {
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
  };

  const handleAddApplication = async (jobListing: string, jobSource: string | null) => {
    try {
      setIsProcessing(true);
      const result = await window.electronAPI.claude.ingestJobListing(jobListing, 'Unknown Company', jobSource);

      if (!result.success) {
        throw new Error(result.error || 'Failed to add application');
      }

      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      throw new Error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAdd = async (company: string, jobTitle: string, jobSource: string | null) => {
    try {
      setIsProcessing(true);
      const result = await window.electronAPI.quickAddApplication(company, jobTitle, jobSource);

      if (!result.success) {
        throw new Error(result.error || 'Failed to add application');
      }

      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      throw new Error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteApplication = async (applicationId: string) => {
    try {
      await window.electronAPI.db.deleteApplication(applicationId);
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete application';
      setErrorDialog({
        title: 'Error Deleting Application',
        message: errorMessage,
      });
    }
  };

  // Filter applications based on current filters.
  // Search is multi-field + multi-keyword: every whitespace-separated term must appear
  // somewhere in the application (company, role, location, source, skills, notes…), so
  // you can find a job by the role, the company, or any keyword you remember.
  const filteredApplications = applications.filter((app) => {
    if (filters.search) {
      const haystack = [
        app.company,
        app.job_title,
        app.location,
        app.job_source,
        app.required_skills,
        app.nice_to_have_skills,
        app.key_responsibilities,
        app.notes,
        app.job_description,
        app.current_stage,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const terms = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every((term) => haystack.includes(term))) {
        return false;
      }
    }
    if (filters.stage && app.current_stage !== filters.stage) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-8">Applications</h2>

      {/* Filter Bar */}
      <FilterBar onFilterChange={handleFilterChange} onAddClick={handleAddClick} />

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600">Loading applications...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredApplications.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600">
            {applications.length === 0
              ? 'No applications yet. Add one to get started!'
              : `No applications match${filters.search ? ` “${filters.search}”` : ' this filter'}.`}
          </p>
        </div>
      )}

      {/* Applications Grid */}
      {!loading && filteredApplications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '24px' }}>
          {filteredApplications.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              onClick={onSelectApplication}
              onDelete={handleDeleteApplication}
              stages={stagesForApp(app.workflow_id, app.current_stage)}
              onChangeStage={handleChangeStage}
            />
          ))}
        </div>
      )}

      {/* Add Application Modal */}
      {showAddModal && (
        <AddApplicationModal
          onClose={handleCloseModal}
          onSubmit={handleAddApplication}
          onQuickAdd={handleQuickAdd}
          isLoading={isProcessing}
        />
      )}

      {/* Error Dialog */}
      {errorDialog && (
        <Dialog
          isOpen={true}
          title={errorDialog.title}
          message={errorDialog.message}
          onConfirm={() => setErrorDialog(null)}
          onCancel={() => setErrorDialog(null)}
          confirmText="OK"
          isDangerous={false}
        />
      )}
    </div>
  );
};

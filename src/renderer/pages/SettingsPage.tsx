import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { Workflow } from '../../shared/types';

interface WorkflowForm {
  company: string;
  name: string;
  stages: string;
  isDefault: boolean;
}

interface ClaudeAuthStatus {
  authenticated: boolean;
  tokenPath?: string;
  error?: string;
}

export const SettingsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showAddWorkflow, setShowAddWorkflow] = useState(false);
  const [claudeAuth, setClaudeAuth] = useState<ClaudeAuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [form, setForm] = useState<WorkflowForm>({
    company: '',
    name: '',
    stages: '',
    isDefault: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
    checkClaudeAuth();
  }, []);

  const checkClaudeAuth = async () => {
    try {
      setCheckingAuth(true);
      setAuthMessage(null);
      const status = await window.electronAPI.claude.checkAuth();
      setClaudeAuth(status);

      console.log('Claude auth check result:', status);

      if (status.authenticated) {
        setAuthMessage('✓ Claude authenticated! Extract with AI is ready to use.');
      } else {
        setAuthMessage('Claude not detected. Check the console or try the manual path option below.');
      }
    } catch (err) {
      console.error('Error checking Claude auth:', err);
      setAuthMessage('Error checking authentication status');
      setClaudeAuth({
        authenticated: false,
        error: 'Failed to check Claude authentication status',
      });
    } finally {
      setCheckingAuth(false);
    }
  };

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.db.getAllWorkflows();
      setWorkflows(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workflows';
      setError(message);
      console.error('Error loading workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!form.company.trim()) {
      alert('Please enter a company name');
      return;
    }
    if (!form.name.trim()) {
      alert('Please enter a workflow name');
      return;
    }
    if (!form.stages.trim()) {
      alert('Please enter workflow stages');
      return;
    }

    try {
      // Parse stages
      const stagesList = form.stages
        .split(',')
        .map((stage) => stage.trim())
        .filter((stage) => stage.length > 0);

      // Create workflow
      await window.electronAPI.db.createWorkflow(
        form.company.trim(),
        form.name.trim(),
        stagesList,
        form.isDefault
      );

      // Reset form
      setForm({
        company: '',
        name: '',
        stages: '',
        isDefault: false,
      });
      setShowAddWorkflow(false);

      // Reload workflows
      await loadWorkflows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workflow';
      setError(message);
      console.error('Error creating workflow:', err);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      await window.electronAPI.db.deleteWorkflow(id);
      await loadWorkflows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete workflow';
      setError(message);
      console.error('Error deleting workflow:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px', color: 'var(--ink)' }}>
          Settings
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '32px', color: 'var(--ink)' }}>
        Settings
      </h2>

      {/* Error message */}
      {error && (
        <div
          style={{
            marginBottom: '24px',
            padding: '12px 16px',
            backgroundColor: '#fee',
            border: '1px solid var(--accent)',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--accent)',
          }}
        >
          {error}
        </div>
      )}

      {/* Claude status */}
      <div
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '4px',
          padding: '24px',
          marginBottom: '32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
            Claude AI Status
          </h3>
          {claudeAuth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {claudeAuth.authenticated ? (
                <>
                  <CheckCircle size={16} style={{ color: '#16a34a' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a' }}>Connected</span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} style={{ color: '#ca8a04' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#ca8a04' }}>Not Connected</span>
                </>
              )}
            </div>
          )}
        </div>

        {claudeAuth && claudeAuth.authenticated ? (
          <div
            style={{
              backgroundColor: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            <p style={{ fontSize: '13px', color: '#166534', marginBottom: '8px' }}>
              ✓ Claude is authenticated and ready for Extract with AI.
            </p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#fefce8',
              border: '1px solid #fde047',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            <p style={{ fontSize: '13px', color: '#713f12', marginBottom: '12px' }}>
              To use Extract with AI, run this command in your terminal:
            </p>
            <div
              style={{
                backgroundColor: 'var(--bg)',
                padding: '8px 12px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'var(--ink)',
                marginBottom: '12px',
              }}
            >
              claude login
            </div>
            <button
              onClick={() => checkClaudeAuth()}
              disabled={checkingAuth}
              style={{
                padding: '8px 16px',
                backgroundColor: checkingAuth ? 'var(--muted)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: checkingAuth ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                opacity: checkingAuth ? 0.6 : 1,
              }}
              onMouseEnter={(e) => !checkingAuth && (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {checkingAuth ? 'Checking...' : 'Check Status'}
            </button>
            {authMessage && (
              <p
                style={{
                  fontSize: '12px',
                  color: claudeAuth?.authenticated ? '#16a34a' : '#ca8a04',
                  marginTop: '8px',
                  fontWeight: 500,
                }}
              >
                {authMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Workflows Section */}
      <div
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '4px',
          padding: '24px',
        }}
      >
        {/* Header with Add button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Company Workflows</h3>
          <button
            onClick={() => setShowAddWorkflow(!showAddWorkflow)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {/* Add Workflow Form */}
        {showAddWorkflow && (
          <form
            onSubmit={handleAddWorkflow}
            style={{
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '4px',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                Company Name
              </label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="e.g., Google"
                style={{
                  width: '100%',
                  padding: '8px 0',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--line)',
                  fontSize: '13px',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                Workflow Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Standard Process"
                style={{
                  width: '100%',
                  padding: '8px 0',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--line)',
                  fontSize: '13px',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                Stages (comma-separated)
              </label>
              <textarea
                value={form.stages}
                onChange={(e) => setForm({ ...form, stages: e.target.value })}
                placeholder="e.g., applied, phone_screen, interview, offer"
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                  minHeight: '60px',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="isDefault" style={{ fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>
                Set as default
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowAddWorkflow(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--muted)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--panel)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Create
              </button>
            </div>
          </form>
        )}

        {/* Workflows list */}
        {workflows.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No workflows defined yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                style={{
                  backgroundColor: 'var(--panel)',
                  padding: '12px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
                    {workflow.company}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                    {workflow.name}
                  </p>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {workflow.stages.map((stage) => (
                      <span
                        key={stage}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'var(--accent)',
                          color: '#fff',
                          borderRadius: '2px',
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {stage}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteWorkflow(workflow.id)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    flexShrink: 0,
                  }}
                  title="Delete workflow"
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

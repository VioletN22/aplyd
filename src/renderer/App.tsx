import React, { useState, useEffect } from 'react';
import { Navigation, Page } from './components/Navigation';
import { DashboardPage } from './pages/DashboardPage';
import { ListPage } from './pages/ListPage';
import { FlowPage } from './pages/FlowPage';
import { SetupPage } from './pages/SetupPage';
import { DetailPage } from './pages/DetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ActivationScreen } from './components/ActivationScreen';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  // collapsible left nav (more room for the workspace) - persisted
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => localStorage.getItem('navCollapsed') === '1');
  const toggleNav = () => setNavCollapsed((v) => { const n = !v; localStorage.setItem('navCollapsed', n ? '1' : '0'); return n; });
  // purpl hq license gate: null = checking, false = needs activation, true = unlocked
  const [licensed, setLicensed] = useState<boolean | null>(null);

  useEffect(() => {
    window.electronAPI.license
      .status()
      .then((s) => setLicensed(s.licensed))
      .catch(() => setLicensed(false));
  }, []);

  const handleSelectApplication = (id: string) => {
    setSelectedApplicationId(id);
    setCurrentPage('detail');
  };

  const handleBack = () => {
    setCurrentPage('list');
    setSelectedApplicationId(null);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'list':
        return <ListPage onSelectApplication={handleSelectApplication} />;
      case 'flow':
        return <FlowPage />;
      case 'setup':
        return <SetupPage />;
      case 'detail':
        return <DetailPage applicationId={selectedApplicationId} onBack={handleBack} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  // License gate - block the app until activated (one key unlocks the bundle).
  if (licensed === null) {
    return <div style={{ height: '100vh', backgroundColor: 'var(--bg)' }} />;
  }
  if (!licensed) {
    return <ActivationScreen onActivated={() => setLicensed(true)} />;
  }

  return (
    <div className="screen-main" style={{ ['--nav-w' as string]: navCollapsed ? '0px' : '256px' } as React.CSSProperties}>
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} collapsed={navCollapsed} />
      <div className="main-content">
        <header className="header">
          <button
            onClick={toggleNav}
            title={navCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-label="Toggle sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', padding: 4, marginRight: 4, display: 'flex', alignItems: 'center', opacity: 0.7 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
            </svg>
          </button>
          <h1 className="wordmark">Job Tracker</h1>
          <div className="spacer"></div>
        </header>
        <div className="content">
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

export default App;

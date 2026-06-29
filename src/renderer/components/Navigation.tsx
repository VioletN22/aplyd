import React from 'react';

export type Page = 'dashboard' | 'list' | 'flow' | 'setup' | 'detail' | 'settings';

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate, collapsed }) => {
  const navItems: { label: string; page: Page }[] = [
    { label: 'Dashboard', page: 'dashboard' },
    { label: 'Applications', page: 'list' },
    { label: 'Flow', page: 'flow' },
    { label: 'Setup', page: 'setup' },
    { label: 'Settings', page: 'settings' },
  ];

  return (
    <div className="sidebar" style={{
      display: 'flex', flexDirection: 'column',
      width: collapsed ? 0 : 256, minWidth: collapsed ? 0 : 256,
      borderRight: collapsed ? 'none' : undefined, overflow: 'hidden',
      transition: 'width .18s ease, min-width .18s ease',
    }}>
      {/* spacer aligns the nav under the top divider; the wordmark now lives in
          the main header (next to the collapse toggle) so it isn't duplicated */}
      <div style={{ height: 58, flex: 'none', borderBottom: '1px solid var(--ink)' }} />

      <nav style={{ padding: '24px', flex: 1 }}>
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`navlink ${currentPage === item.page ? 'active' : ''}`}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              marginBottom: '16px',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

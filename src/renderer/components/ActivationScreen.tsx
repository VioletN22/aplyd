import React, { useState } from 'react';

interface ActivationScreenProps {
  onActivated: () => void;
}

const PURPLE = '#5820C8';

/**
 * purpl hq license gate. Shown before the app loads when there's no valid
 * activation. One license unlocks every purpl hq app, so activating here also
 * unlocks the other apps in the bundle.
 */
export const ActivationScreen: React.FC<ActivationScreenProps> = ({ onActivated }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.electronAPI.license.activate(key);
      if (res.ok) {
        onActivated();
      } else {
        setError(res.error || 'Activation failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "-apple-system, 'SF Pro Display', sans-serif",
            fontWeight: 300,
            fontSize: '34px',
            letterSpacing: '-0.04em',
            color: 'var(--ink)',
            marginBottom: '28px',
          }}
        >
          purpl h<span style={{ color: PURPLE }}>q</span>
        </div>

        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
          Activate to unlock
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px', lineHeight: 1.5 }}>
          Enter your purpl hq license key. One key unlocks the whole bundle.
        </p>

        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && activate()}
          placeholder="PURPL-XXXX-XXXX-XXXX"
          autoFocus
          spellCheck={false}
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: 'var(--panel)',
            border: `1px solid ${error ? 'var(--accent)' : 'var(--line)'}`,
            fontSize: '14px',
            fontFamily: 'inherit',
            color: 'var(--ink)',
            textAlign: 'center',
            letterSpacing: '0.04em',
            outline: 'none',
            marginBottom: '12px',
          }}
        />

        {error && (
          <p style={{ fontSize: '12.5px', color: 'var(--accent)', marginBottom: '12px' }}>{error}</p>
        )}

        <button
          onClick={activate}
          disabled={busy || !key.trim()}
          style={{
            width: '100%',
            padding: '13px',
            backgroundColor: PURPLE,
            color: '#fff',
            border: 'none',
            fontSize: '14px',
            fontWeight: 600,
            cursor: busy || !key.trim() ? 'default' : 'pointer',
            opacity: busy || !key.trim() ? 0.55 : 1,
          }}
        >
          {busy ? 'Activating…' : 'Activate'}
        </button>

        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '22px', lineHeight: 1.6 }}>
          Find your key in your account at{' '}
          <span style={{ color: 'var(--ink)' }}>hq.purpl.solutions</span>.
        </p>
      </div>
    </div>
  );
};

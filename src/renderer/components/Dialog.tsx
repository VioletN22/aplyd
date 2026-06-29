import React from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel',
  isDangerous = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'var(--bg)',
          borderRadius: '8px',
          padding: '32px 24px',
          maxWidth: '320px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
          minWidth: '280px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h2
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: message ? '12px' : '20px',
            textAlign: 'center',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>

        {/* Message */}
        {message && (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--muted)',
              marginBottom: '20px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        )}

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--ink)',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--panel)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: isDangerous ? '#ef4444' : 'var(--accent)',
              border: 'none',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  ...props
}) => {
  const getStyles = (variant: ButtonVariant) => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--accent)',
          color: '#ffffff',
          border: 'none',
        };
      case 'secondary':
        return {
          backgroundColor: 'var(--panel)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
        };
      case 'danger':
        return {
          backgroundColor: '#ef4444',
          color: '#ffffff',
          border: 'none',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
        };
    }
  };

  const styles = getStyles(variant);

  return (
    <button
      style={{
        padding: '10px 16px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        ...styles,
        ...(props.disabled && {
          opacity: 0.5,
          cursor: 'not-allowed',
        }),
      }}
      onMouseEnter={(e) => {
        if (!props.disabled) {
          e.currentTarget.style.opacity = '0.85';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
      {...props}
    >
      {children}
    </button>
  );
};

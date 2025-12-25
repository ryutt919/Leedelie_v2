import React, { CSSProperties } from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: CSSProperties;
}

export function Button({ children, onClick, type = 'button', variant = 'primary', disabled = false, style }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
}

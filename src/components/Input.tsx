import { CSSProperties } from 'react';

interface InputProps {
  type?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  min?: number | string;
  max?: number;
  step?: number | string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Input({ type = 'text', value, onChange, placeholder, label, min, max, step, disabled, style }: InputProps) {
  return (
    <div className="input-group">
      {label && <label>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        style={style}
        className="input"
      />
    </div>
  );
}

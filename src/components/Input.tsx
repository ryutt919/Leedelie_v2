interface InputProps {
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  min?: number;
  max?: number;
}

export function Input({ type = 'text', value, onChange, placeholder, label, min, max }: InputProps) {
  return (
    <div className="input-group">
      {label && <label>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="input"
      />
    </div>
  );
}

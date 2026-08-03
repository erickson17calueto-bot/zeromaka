"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  onEnter?: () => void;
  hint?: string;
  required?: boolean;
};

export default function PasswordInput({ id, label, value, onChange, autoComplete, onEnter, hint, required }: Props) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}{required && <span className="text-maka-400" aria-hidden="true"> *</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          className="input pr-11"
          type={visible ? "text" : "password"}
          placeholder="••••••••"
          value={value}
          autoComplete={autoComplete}
          aria-describedby={hintId}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors">
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-[12px] text-ink-500">{hint}</p>}
    </div>
  );
}

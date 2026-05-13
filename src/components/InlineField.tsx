import { useEffect, useRef, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";

type Status = "idle" | "saving" | "saved" | "error";

type Option = { value: string; label: string };

interface BaseProps {
  label: string;
  onSave: (value: any) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
}

interface TextProps extends BaseProps {
  type: "text" | "email" | "tel" | "number" | "date";
  value: string;
  placeholder?: string;
}

interface TextareaProps extends BaseProps {
  type: "textarea";
  value: string;
  placeholder?: string;
  rows?: number;
}

interface SelectProps extends BaseProps {
  type: "select";
  value: string;
  options: Option[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}

interface MultiSelectProps extends BaseProps {
  type: "multiselect";
  value: string[];
  options: Option[];
}

interface BoolProps extends BaseProps {
  type: "boolean";
  value: boolean;
  trueLabel?: string;
  falseLabel?: string;
}

export type InlineFieldProps =
  | TextProps | TextareaProps | SelectProps | MultiSelectProps | BoolProps;

const StatusIcon = ({ status }: { status: Status }) => {
  if (status === "saving") return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  if (status === "saved") return <Check className="w-3 h-3 text-emerald-600" />;
  if (status === "error") return <AlertCircle className="w-3 h-3 text-destructive" />;
  return null;
};

export const InlineField = (props: InlineFieldProps) => {
  const { label, onSave, className, disabled } = props;
  const [status, setStatus] = useState<Status>("idle");
  const [draft, setDraft] = useState<any>((props as any).value);
  const lastSavedRef = useRef<any>((props as any).value);

  useEffect(() => {
    setDraft((props as any).value);
    lastSavedRef.current = (props as any).value;
  }, [(props as any).value]);

  const isEqual = (a: any, b: any) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      const sa = [...a].sort(); const sb = [...b].sort();
      return sa.every((v, i) => v === sb[i]);
    }
    return a === b;
  };

  const commit = async (next: any) => {
    if (isEqual(next, lastSavedRef.current)) return;
    setStatus("saving");
    try {
      await onSave(next);
      lastSavedRef.current = next;
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setStatus("error");
    }
  };

  const labelRow = (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[10px] uppercase tracking-wide font-display font-semibold text-muted-foreground">{label}</span>
      <StatusIcon status={status} />
    </div>
  );

  const inputCls =
    "w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background hover:border-foreground/40 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors font-body disabled:opacity-50 disabled:cursor-not-allowed";

  if (props.type === "textarea") {
    return (
      <div className={className}>
        {labelRow}
        <textarea
          value={draft ?? ""}
          rows={props.rows || 2}
          placeholder={props.placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          className={inputCls + " resize-y"}
        />
      </div>
    );
  }

  if (props.type === "select") {
    return (
      <div className={className}>
        {labelRow}
        <select
          value={draft ?? ""}
          disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          className={inputCls}
        >
          {props.allowEmpty && <option value="">{props.emptyLabel ?? "—"}</option>}
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {/* keep current value if not in options */}
          {draft && !props.options.some((o) => o.value === draft) && (
            <option value={draft}>{draft}</option>
          )}
        </select>
      </div>
    );
  }

  if (props.type === "multiselect") {
    const selected: string[] = Array.isArray(draft) ? draft : [];
    const toggle = (v: string) => {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
      setDraft(next);
      commit(next);
    };
    return (
      <div className={className}>
        {labelRow}
        <div className="flex flex-wrap gap-1">
          {props.options.map((o) => {
            const active = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() => toggle(o.value)}
                className={`px-2 py-1 text-[11px] rounded border transition-colors font-display font-semibold ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted-foreground border-border hover:border-foreground/40"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (props.type === "boolean") {
    return (
      <div className={className}>
        {labelRow}
        <button
          type="button"
          disabled={disabled}
          onClick={() => { const next = !draft; setDraft(next); commit(next); }}
          className={`px-3 py-1.5 text-xs rounded-md border font-display font-bold uppercase transition-colors ${
            draft
              ? "bg-emerald-600 text-white border-transparent"
              : "bg-card text-muted-foreground border-border hover:border-foreground/40"
          }`}
        >
          {draft ? (props.trueLabel ?? "Oui") : (props.falseLabel ?? "Non")}
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {labelRow}
      <input
        type={props.type}
        value={draft ?? ""}
        placeholder={props.placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={inputCls}
      />
    </div>
  );
};

export default InlineField;
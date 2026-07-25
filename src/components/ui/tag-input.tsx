import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxLength?: number;
}

export function TagInput({ value, onChange, placeholder = "Digite e pressione Enter", maxLength = 80 }: Props) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, v.slice(0, maxLength)]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  return (
    <div className="space-y-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && commit(draft)}
        placeholder={placeholder}
        maxLength={maxLength}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                className="hover:text-destructive"
                aria-label={`Remover ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Pressione <kbd className="px-1 rounded border bg-muted text-[10px]">Enter</kbd> ou vírgula para adicionar.
      </p>
    </div>
  );
}

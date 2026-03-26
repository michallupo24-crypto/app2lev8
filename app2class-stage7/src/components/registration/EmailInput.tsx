import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { EMAIL_SUFFIXES } from "@/lib/constants";

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
}

const EmailInput = ({ value, onChange }: EmailInputProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const localPart = value.split("@")[0] || "";
  const hasAt = value.includes("@");
  const typedDomain = hasAt ? value.split("@")[1] : "";

  const filteredSuffixes = EMAIL_SUFFIXES.filter((s) =>
    !typedDomain || s.startsWith(typedDomain)
  );

  const handleSelect = (suffix: string) => {
    onChange(`${localPart}@${suffix}`);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="email"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(e.target.value.includes("@"));
        }}
        onFocus={() => setShowSuggestions(value.includes("@"))}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="name@email.com"
        dir="ltr"
        required
      />
      {showSuggestions && filteredSuffixes.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {filteredSuffixes.map((suffix) => (
            <button
              key={suffix}
              type="button"
              onClick={() => handleSelect(suffix)}
              className="w-full px-3 py-2 text-sm text-right hover:bg-muted transition-colors"
              dir="ltr"
            >
              {localPart}@{suffix}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmailInput;

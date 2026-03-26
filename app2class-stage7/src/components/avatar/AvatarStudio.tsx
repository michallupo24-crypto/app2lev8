import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import AvatarPreview from "./AvatarPreview";
import {
  BODY_TYPES,
  EYE_COLORS,
  HAIR_STYLES_BY_BODY,
  SKIN_COLORS,
  HAIR_COLORS,
} from "./avatarData";

// Full avatar config - supports both old camelCase fields (DB mapping) and new SVG fields
export interface AvatarConfig {
  // Old fields (kept for DB backwards compat)
  faceShape?: string;
  skinColor?: string;
  eyeShape?: string;
  eyeColor?: string;
  hairStyle?: string;
  hairColor?: string;
  facialHair?: string;
  outfit?: string;
  outfitColor?: string;
  accessory?: string;
  expression?: string;
  background?: string;
  // New SVG-based fields
  body_type?: string;
  eye_color?: string;
  skin?: string;
  hair_style?: string;
  hair_color?: string;
}

export const defaultAvatarConfig: AvatarConfig = {
  body_type: "basic",
  eye_color: "brown",
  skin: "#FDDBB4",
  hair_style: "boy",
  hair_color: "#2C1A0E",
  // Keep old defaults for backward compat
  faceShape: "round",
  skinColor: "#FFD2A1",
  eyeShape: "round",
  eyeColor: "#4A3728",
  hairStyle: "short",
  hairColor: "#2C1B0E",
  facialHair: "none",
  outfit: "hoodie",
  outfitColor: "#3B82F6",
  accessory: "none",
  expression: "happy",
  background: "#E0F2FE",
};

interface AvatarStudioProps {
  config: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
  variant?: "student" | "adult";
}

const ColorSwatch = ({
  colors,
  value,
  onChange,
  label,
}: {
  colors: { hex: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) => (
  <div className="space-y-2">
    <Label className="font-heading text-sm">{label}</Label>
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className="w-9 h-9 rounded-full transition-all hover:scale-110"
          style={{
            backgroundColor: c.hex,
            border: value === c.hex ? "3px solid hsl(var(--primary))" : "2px solid hsl(var(--border))",
            transform: value === c.hex ? "scale(1.15)" : undefined,
            boxShadow: value === c.hex ? "0 0 8px hsl(var(--primary) / 0.4)" : undefined,
          }}
        />
      ))}
    </div>
  </div>
);

const OptionPicker = ({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) => (
  <div className="space-y-2">
    <Label className="font-heading text-sm">{label}</Label>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-body transition-all ${
            value === opt.key
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const AvatarStudio = ({ config, onChange, variant = "student" }: AvatarStudioProps) => {
  const update = (key: keyof AvatarConfig, value: string) => {
    onChange({ ...config, [key]: value });
  };

  const bodyTypeKey = config.body_type || "basic";
  const currentHairStyles = HAIR_STYLES_BY_BODY[bodyTypeKey] || HAIR_STYLES_BY_BODY.basic;

  const handleBodyTypeChange = (newBodyType: string) => {
    const newHairStyles = HAIR_STYLES_BY_BODY[newBodyType];
    const currentHairExists = newHairStyles.some((h) => h.key === config.hair_style);
    onChange({
      ...config,
      body_type: newBodyType,
      hair_style: currentHairExists ? config.hair_style : newHairStyles[0].key,
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Preview */}
      <div className="flex justify-center items-start">
        <div className="sticky top-24">
          <AvatarPreview config={config} size={200} />
          <p className="text-center text-xs text-muted-foreground mt-2 font-body">תצוגה מקדימה</p>
        </div>
      </div>

      {/* Options */}
      <Card className="border-border/50">
        <CardContent className="pt-4 space-y-5">
          <OptionPicker
            label="סוג גוף"
            options={BODY_TYPES.map((b) => ({ key: b.key, label: b.label }))}
            value={bodyTypeKey}
            onChange={handleBodyTypeChange}
          />
          <ColorSwatch
            label="צבע עיניים"
            colors={EYE_COLORS.map((e) => ({ hex: e.hex, label: e.label }))}
            value={EYE_COLORS.find((e) => e.key === (config.eye_color || "brown"))?.hex || EYE_COLORS[0].hex}
            onChange={(hex) => {
              const entry = EYE_COLORS.find((e) => e.hex === hex);
              if (entry) update("eye_color", entry.key);
            }}
          />
          <ColorSwatch
            label="גוון עור"
            colors={SKIN_COLORS}
            value={config.skin || "#FDDBB4"}
            onChange={(v) => update("skin", v)}
          />
          <OptionPicker
            label="סגנון שיער"
            options={currentHairStyles.map((h) => ({ key: h.key, label: h.label }))}
            value={config.hair_style || "boy"}
            onChange={(v) => update("hair_style", v)}
          />
          <ColorSwatch
            label="צבע שיער"
            colors={HAIR_COLORS}
            value={config.hair_color || "#2C1A0E"}
            onChange={(v) => update("hair_color", v)}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default AvatarStudio;

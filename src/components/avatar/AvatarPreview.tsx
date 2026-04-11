import { useState, useEffect } from "react";
import type { AvatarConfig } from "./AvatarStudio";
import {
  BODY_TYPES,
  EYE_COLORS,
  HAIR_STYLES_BY_BODY,
  SKIN_CSS_FILTER,
  avatarUrl,
  replaceHairColors,
} from "./avatarData";

function useSvg(svgUrl: string | null) {
  const [content, setContent] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!svgUrl) { setContent(""); setError(false); return; }
    setError(false);
    fetch(svgUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        // Verify it's actually SVG content
        if (text.includes("<svg") || text.includes("<SVG")) {
          setContent(text);
        } else {
          setError(true);
          setContent("");
        }
      })
      .catch(() => { setContent(""); setError(true); });
  }, [svgUrl]);
  return { content, error };
}

function useHairSvg(svgUrl: string | null, hairColor: string) {
  const [content, setContent] = useState("");
  useEffect(() => {
    if (!svgUrl) { setContent(""); return; }
    fetch(svgUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (text.includes("<svg") || text.includes("<SVG")) {
          setContent(replaceHairColors(text, hairColor));
        } else {
          setContent("");
        }
      })
      .catch(() => setContent(""));
  }, [svgUrl, hairColor]);
  return content;
}

function inlineSvg(raw: string) {
  return raw.replace(/<svg/, '<svg style="width:100%;height:100%;object-fit:contain"');
}

interface AvatarPreviewProps {
  config: AvatarConfig;
  size?: number;
}

const AvatarPreview = ({ config, size = 160 }: AvatarPreviewProps) => {
  const bodyTypeKey = config.body_type || "basic";
  const eyeColorKey = config.eye_color || "brown";
  const skinColor = config.skin || "#FDDBB4";
  const hairStyleKey = config.hair_style || "boy";
  const hairColor = config.hair_color || "#2C1A0E";

  const bodyTypeEntry = BODY_TYPES.find((b) => b.key === bodyTypeKey) || BODY_TYPES[0];
  const eyeEntry = EYE_COLORS.find((e) => e.key === eyeColorKey) || EYE_COLORS[0];
  const hairStyles = HAIR_STYLES_BY_BODY[bodyTypeKey] || HAIR_STYLES_BY_BODY.basic;
  const hairEntry = hairStyles.find((h) => h.key === hairStyleKey) || hairStyles[0];

  const faceUrl = avatarUrl(bodyTypeEntry.faceFile);
  const bodyUrl = avatarUrl(
    (eyeEntry.files as Record<string, string>)[bodyTypeKey] ||
      (eyeEntry.files as Record<string, string>).basic
  );
  const hairUrl = hairEntry.file ? avatarUrl(hairEntry.file) : null;

  const face = useSvg(faceUrl);
  const body = useSvg(bodyUrl);
  const hairSvg = useHairSvg(hairUrl, hairColor);
  const skinFilter = SKIN_CSS_FILTER[skinColor] || SKIN_CSS_FILTER["#F5C5A3"];

  const dim = size;
  const hasError = face.error || body.error;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex items-center justify-center bg-white rounded-2xl overflow-hidden shadow-md"
        style={{ width: dim, height: dim }}
      >
        {hasError ? (
          <div className="flex items-center justify-center w-full h-full bg-muted">
            <svg viewBox="0 0 24 24" fill="none" className="w-1/2 h-1/2 text-muted-foreground/40">
              <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" fill="currentColor"/>
            </svg>
          </div>
        ) : face.content ? (
          <div
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            style={{ filter: skinFilter }}
            dangerouslySetInnerHTML={{ __html: inlineSvg(face.content) }}
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
        )}
        {body.content && (
          <div
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            style={{ mixBlendMode: "multiply" }}
            dangerouslySetInnerHTML={{ __html: inlineSvg(body.content) }}
          />
        )}
        {hairSvg && (
          <div
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            style={{ mixBlendMode: "multiply" }}
            dangerouslySetInnerHTML={{ __html: inlineSvg(hairSvg) }}
          />
        )}
      </div>
    </div>
  );
};

export default AvatarPreview;

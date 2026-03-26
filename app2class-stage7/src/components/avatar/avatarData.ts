// Avatar configuration data - ported from original app2classUpdated repo
// SVGs are served from /avatars/ (public folder)

const BASE_URL = "/avatars/";

export function avatarUrl(filename: string): string {
  return BASE_URL + encodeURIComponent(filename);
}

export const BODY_TYPES = [
  { key: "basic",  label: "רגיל",      faceFile: "base face.svg" },
  { key: "wider",  label: "רחב",       faceFile: "wider face.svg" },
  { key: "taller", label: "גבוה ורזה", faceFile: "thiner taller face.svg" },
] as const;

export const EYE_COLORS = [
  { label: "חום",       key: "brown",      hex: "#8B4513",
    files: { basic: "basic body brown eyes.svg",      wider: "wide body brown eyes.svg",      taller: "tall body brown eyes.svg" } },
  { label: "חום כהה",   key: "brown_dark", hex: "#3B1A00",
    files: { basic: "basic body brown dark eyes.svg", wider: "wide body brown dark eyes.svg", taller: "tall body brown dark eyes.svg" } },
  { label: "כחול",      key: "blue",       hex: "#4A90D9",
    files: { basic: "basic body blue eyes.svg",       wider: "wide body blue eyes.svg",       taller: "tall body blue eyes.svg" } },
  { label: "כחול כהה",  key: "blue_dark",  hex: "#1A3A6B",
    files: { basic: "basic body blue dark eyes.svg",  wider: "wide body blue dark eyes.svg",  taller: "tall body blue dark eyes.svg" } },
  { label: "ירוק",      key: "green",      hex: "#4CAF50",
    files: { basic: "basic body green eyes.svg",      wider: "wide body green eyes.svg",      taller: "tall body green eyes.svg" } },
  { label: "ירוק כהה",  key: "green_dark", hex: "#1A4A1A",
    files: { basic: "basic body green dark eyes.svg", wider: "widebody green dark eyes.svg",  taller: "tall body green dark eyes.svg" } },
] as const;

export const HAIR_STYLES_BY_BODY: Record<string, { key: string; label: string; file: string | null }[]> = {
  basic: [
    { key: "boy",        label: "ילד קצר",      file: "base boy hair.svg" },
    { key: "curly",      label: "מתולתל קצר",   file: "base face curly short hair.svg" },
    { key: "mullet",     label: "מאלט",          file: "base mullet boy hair.svg" },
    { key: "girl_long",  label: "ארוך בנות",     file: "girl base long hair.svg" },
    { key: "bun",        label: "שיער קשור",     file: "basic body girl bun hair.svg" },
    { key: "curly_long", label: "מתולתל ארוך",   file: "basic body girl curly long hair.svg" },
    { key: "ponytail",   label: "קוקו",          file: "basic girl ponytail hair.svg" },
    { key: "short_girl", label: "קצר בנות",      file: "basic girl short hair.svg" },
    { key: "none",       label: "ללא שיער",      file: null },
  ],
  wider: [
    { key: "boy",        label: "ילד קצר",      file: "wider face boy hair.svg" },
    { key: "curly",      label: "מתולתל קצר",   file: "wide face short curly hair.svg" },
    { key: "mullet",     label: "מאלט",          file: "wide boy ullet hair.svg" },
    { key: "girl_long",  label: "ארוך בנות",     file: "widw face girl long hair.svg" },
    { key: "bun",        label: "שיער קשור",     file: "wide girl bun hair.svg" },
    { key: "curly_long", label: "מתולתל ארוך",   file: "wide body girl long curly hair.svg" },
    { key: "ponytail",   label: "קוקו",          file: "wide girl ponytail hair.svg" },
    { key: "short_girl", label: "קצר בנות",      file: "wide girl short hair.svg" },
    { key: "none",       label: "ללא שיער",      file: null },
  ],
  taller: [
    { key: "boy",        label: "ילד קצר",      file: "tall face base boy hair.svg" },
    { key: "curly",      label: "מתולתל קצר",   file: "tall face short curly hair.svg" },
    { key: "mullet",     label: "מאלט",          file: "tall boy mullet hair.svg" },
    { key: "girl_long",  label: "ארוך בנות",     file: "tall face girl long hair.svg" },
    { key: "bun",        label: "שיער קשור",     file: "tall body girl bun hair.svg" },
    { key: "curly_long", label: "מתולתל ארוך",   file: "tall body girl curly long hair.svg" },
    { key: "ponytail",   label: "קוקו",          file: "tall girl ponytail hair.svg" },
    { key: "short_girl", label: "קצר בנות",      file: "tall girl short hair.svg" },
    { key: "none",       label: "ללא שיער",      file: null },
  ],
};

export const SKIN_COLORS = [
  { label: "לבן שנהב",   hex: "#FEECD2" },
  { label: "בהיר מאוד",  hex: "#FDDBB4" },
  { label: "בהיר",       hex: "#F5C5A3" },
  { label: "אפרסק",      hex: "#EEB98A" },
  { label: "חיטה",       hex: "#E0AC69" },
  { label: "זהוב",       hex: "#D4915A" },
  { label: "חום בינוני", hex: "#C68642" },
  { label: "חום",        hex: "#A0622A" },
  { label: "כהה",        hex: "#8D5524" },
  { label: "כהה מאוד",   hex: "#6B3A1F" },
  { label: "שחום",       hex: "#4A2912" },
  { label: "שחור עור",   hex: "#2D1A0E" },
];

export const SKIN_CSS_FILTER: Record<string, string> = {
  "#FEECD2": "brightness(1.15) saturate(0.6)",
  "#FDDBB4": "brightness(1.08) saturate(0.8)",
  "#F5C5A3": "brightness(1.0) saturate(1.0)",
  "#EEB98A": "sepia(0.2) saturate(1.2) brightness(0.95)",
  "#E0AC69": "sepia(0.3) saturate(1.4) brightness(0.9)",
  "#D4915A": "sepia(0.4) saturate(1.6) brightness(0.84)",
  "#C68642": "sepia(0.55) saturate(2) brightness(0.78)",
  "#A0622A": "sepia(0.65) saturate(2.1) brightness(0.66)",
  "#8D5524": "sepia(0.75) saturate(2.2) brightness(0.55)",
  "#6B3A1F": "sepia(0.85) saturate(2.1) brightness(0.44)",
  "#4A2912": "sepia(0.9) saturate(2) brightness(0.32)",
  "#2D1A0E": "sepia(1) saturate(1.8) brightness(0.2)",
};

export const HAIR_COLORS = [
  { label: "שחור",         hex: "#0D0D0D" },
  { label: "חום כהה",      hex: "#2C1A0E" },
  { label: "חום",          hex: "#5C3317" },
  { label: "חום בינוני",   hex: "#8B4513" },
  { label: "חום אדמדם",    hex: "#A0522D" },
  { label: "ג'ינג'י כהה",  hex: "#8B2500" },
  { label: "ג'ינג'י",      hex: "#C0392B" },
  { label: "ג'ינג'י בהיר", hex: "#E8603C" },
  { label: "בלונד כהה",    hex: "#B8860B" },
  { label: "בלונד",        hex: "#D4A017" },
  { label: "בלונד בהיר",   hex: "#F0C040" },
  { label: "אפור",         hex: "#808080" },
  { label: "אפור בהיר",    hex: "#B0B0B0" },
  { label: "לבן",          hex: "#E8E8E8" },
];

/** Replace non-skin, non-white hex colors in SVG text with chosen hair color */
export function replaceHairColors(text: string, hairColor: string): string {
  const hexRegex = /#([0-9A-Fa-f]{6})\b/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = hexRegex.exec(text)) !== null) found.add(m[1].toUpperCase());

  let result = text;
  for (const hex of found) {
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const isWhiteOrNearWhite = r > 240 && g > 240 && b > 240;
    const isSkinLike = r > 200 && g > 160 && b > 120 && r > g && g > b;
    if (!isWhiteOrNearWhite && !isSkinLike) {
      result = result.replace(new RegExp(`#${hex}`, "gi"), hairColor);
    }
  }
  return result;
}

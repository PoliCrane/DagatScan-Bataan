// Real coastal exposure, not just province membership. BATAAN.geojson draws every
// municipality's full border — land border with Pampanga/Zambales included — so it
// can't answer "does this municipality actually touch the sea" on its own; this list
// is that answer, checked directly against the province polygon's own extents (neither
// Dinalupihan nor Hermosa reaches Manila Bay or the South China Sea).
export const COASTAL_MUNICIPALITIES = [
  "Abucay",
  "Bagac",
  "Balanga",
  "Limay",
  "Mariveles",
  "Morong",
  "Orani",
  "Orion",
  "Pilar",
  "Samal",
];

export const LANDLOCKED_MUNICIPALITIES = ["Dinalupihan", "Hermosa"];

export function isLandlocked(municipality) {
  return LANDLOCKED_MUNICIPALITIES.some((m) => m.toLowerCase() === (municipality || "").toLowerCase());
}

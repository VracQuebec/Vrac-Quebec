/** Display-only normalization; stored category and tenant colors remain untouched. */
export const brandColor = "hsl(var(--brand))";
export function displayBrandColor(color?: string | null): string {
  if (!color || /^#(?:7ed321|7dd520|548e15)$/i.test(color.trim())) return brandColor;
  return color;
}

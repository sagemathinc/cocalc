// Replicate debug's hashing and color assignment, but return an HTML hex color
// (written by GPT5)

export function namespaceToColor(namespace: string): string {
  // A palette of colors that look good on a white background
  // (no yellows or washed-out tones)
  const palette: string[] = [
    "#e6194B", // strong red
    "#3cb44b", // strong green
    "#4363d8", // strong blue
    "#f58231", // orange
    "#911eb4", // purple
    "#42d4f4", // cyan
    "#f032e6", // magenta
    "#469990", // teal
    "#9A6324", // brown
    "#800000", // maroon
    "#000075", // navy
    "#a9a9a9", // dark gray
  ];

  function hash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0; // force 32-bit
    }
    return h;
  }

  const h = hash(namespace);
  const idx = Math.abs(h) % palette.length;
  return palette[idx];
}

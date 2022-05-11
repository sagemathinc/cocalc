export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = Math.floor(DEFAULT_FONT_SIZE / 14);
export const MAX_FONT_SIZE = Math.ceil(DEFAULT_FONT_SIZE * 4);
export const MIN_ZOOM = MIN_FONT_SIZE / DEFAULT_FONT_SIZE;
export const MAX_ZOOM = MAX_FONT_SIZE / DEFAULT_FONT_SIZE;
export const ERASE_SIZE = 4;

export const DEFAULT_FONT_FAMILY = "Sans";
export const minFontSize = 7;
export const maxFontSize = 80;
export const minRadius = 0.5;
export const maxRadius = 15;
export const defaultRadius = 1;
export const defaultOpacity = 1;

// see https://www.post-it.com/3M/en_US/post-it/ideas/color/
export const NOTE_COLORS = [
  "#fff9c4",
  "#f5f468",
  "#e8edfa",
  "#f5e3ad",
  "#7ae294",
  "#4dd1f1",
  "#fdaf8a",
  "#f9b2c3",
  "#a8cc67",
  "#fe871c",
  "#fdce04",
  "#cfec6d",
  "#fe5b60",
  "#c1bab9",
];
export const DEFAULT_NOTE = {
  color: NOTE_COLORS[0],
};

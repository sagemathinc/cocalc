import type { Element } from "../whiteboard-editor/types";

// TODO: obviously hard coding this is very much a #v0 thing to do!
const SLIDE = {
  data: { aspectRatio: "16:9", radius: 0.5 },
  h: 3 * 197,
  w: 3 * 350,
  type: "slide",
  id: "the-slide",
  x: (-3 * 197) / 2,
  y: (-3 * 350) / 2,
  z: -Infinity,
} as Element;

const fixedElements: { [id: string]: Element } = {
  [SLIDE.id]: SLIDE,
} as const;

export default fixedElements;

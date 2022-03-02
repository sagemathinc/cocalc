import { Element } from "../types";

interface ElementSpec {
  updateSize?: (element: Partial<Element>) => void; // mutate element
  noResize?: boolean;
}

export const ELEMENTS: { [type: string]: ElementSpec } = {
  icon: {
    updateSize: (element) => {
      element.w = (element.data?.fontSize ?? 20) + 2;
      element.h = (element.data?.fontSize ?? 20) + 2;
    },
    noResize: true,
  },
};

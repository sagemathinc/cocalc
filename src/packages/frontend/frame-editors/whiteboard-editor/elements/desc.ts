import { Element } from "../types";
import { SELECTED_BORDER_WIDTH } from "./style";

interface ElementSpec {
  updateSize?: (element: Partial<Element>) => void; // mutate element
  noResize?: boolean;
}

export const ELEMENTS: { [type: string]: ElementSpec } = {
  icon: {
    updateSize: (element) => {
      element.w = (element.data?.fontSize ?? 20) + 2 * SELECTED_BORDER_WIDTH;
      element.h = (element.data?.fontSize ?? 20) + 2 * SELECTED_BORDER_WIDTH;
    },
    noResize: true,
  },
};

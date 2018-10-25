/**
 * CoCalc Xpra Client
 */

import { Surface } from "./surface";
import { Keyboard } from "./keyboard";

function get_wheel_event_name(): string {
  const element = document.createElement("div");
  for (let name of ["wheel", "mousewheel", "DOMMouseScroll"]) {
    const n = `on${name}`;
    element.setAttribute(n, "return;");
    if (typeof element[n] === "function") {
      return name;
    }
  }
  console.warn("Unable to determine wheel event name");
  return "broken-mousewheel";
}

const WHEEL_EVENT_NAME = get_wheel_event_name();

/*
import { PIXEL_STEP, LINE_HEIGHT, PAGE_HEIGHT } from "./constants";

function normalizeWheel(
  ev: MouseEvent
): {
  spinX: number;
  spinY: number;
  pixelX: number;
  pixelY: number;
  deltaMode: number;
} {
  let spinX = 0,
    spinY = 0,
    pixelX = 0,
    pixelY = 0;

  // Legacy
  if ("detail" in ev) {
    spinY = ev.detail;
  }
  if ("wheelDelta" in ev) {
    spinY = -ev.wheelDelta / 120;
  }
  if ("wheelDeltaY" in ev) {
    spinY = -ev.wheelDeltaY / 120;
  }
  if ("wheelDeltaX" in ev) {
    spinX = -ev.wheelDeltaX / 120;
  }

  // side scrolling on FF with DOMMouseScroll
  if ("axis" in ev && ev.axis === ev.HORIZONTAL_AXIS) {
    spinX = spinY;
    spinY = 0;
  }

  pixelX = spinX * PIXEL_STEP;
  pixelY = spinY * PIXEL_STEP;

  if ("deltaY" in ev) {
    pixelY = ev.deltaY;
  }
  if ("deltaX" in ev) {
    pixelX = ev.deltaX;
  }

  if ((pixelX || pixelY) && ev.deltaMode) {
    if (ev.deltaMode == 1) {
      // delta in LINE units
      pixelX *= LINE_HEIGHT;
      pixelY *= LINE_HEIGHT;
    } else {
      // delta in PAGE units
      pixelX *= PAGE_HEIGHT;
      pixelY *= PAGE_HEIGHT;
    }
  }

  // Fall-back if spin cannot be determined
  if (pixelX && !spinX) {
    spinX = pixelX < 1 ? -1 : 1;
  }
  if (pixelY && !spinY) {
    spinY = pixelY < 1 ? -1 : 1;
  }

  return {
    spinX,
    spinY,
    pixelX,
    pixelY,
    deltaMode: ev.deltaMode || 0
  };
}
*/

function getMouseButton(ev: MouseEvent): number {
  let button: number = ev.which
    ? Math.max(0, ev.which)
    : ev.button
      ? Math.max(0, ev.button) + 1
      : 0;

  if (button === 4) {
    button = 8;
  } else if (button === 5) {
    button = 9;
  }

  return button;
}

function getMouse(
  ev: MouseEvent,
  surface: Surface
): { x: number; y: number; button: number; buttons: number[] } | undefined {
  const { top, left, bottom, right } = surface.canvas.getBoundingClientRect();
  if (
    ev.clientX < left ||
    ev.clientX >= right ||
    ev.clientY < top ||
    ev.clientY >= bottom
  ) {
    // mouse not actually on the surface.
    return;
  }

  const elt = $(surface.canvas);
  const elt_width = elt.width(),
    elt_height = elt.height();
  if (!elt_width || !elt_height) {
    // 0 or undefined width or height
    return;
  }
  const scale_x = surface.w / elt_width,
    scale_y = surface.h / elt_height;
  const x = surface.x + Math.round(scale_x * (ev.clientX - left));
  const y = surface.y + Math.round(scale_y * (ev.clientY - top));
  const buttons = [];
  const button = getMouseButton(ev);

  return { x, y, button, buttons };
}

/**
 * The mouse input handler class
 */
export class Mouse {
  private send: Function;
  private keyboard: Keyboard;
  private findSurface: Function;

  constructor(send: Function, keyboard: Keyboard, findSurface: Function) {
    this.send = send;
    this.keyboard = keyboard;
    this.findSurface = findSurface;
  }

  process(ev: MouseEvent): Surface | undefined {
    const elt_at = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!elt_at) {
      // nothing under mouse, so no point. (possible? I don't  know.)
      return;
    }

    // TODO: right now we abuse things a bit to store the wid on the canvas itself.
    const wid: number | undefined = (elt_at as any).wid;
    if (wid === undefined) {
      return;
    }

    const surface: Surface | undefined = this.findSurface(wid);
    if (surface === undefined) {
      // TODO: this shouldn't happen, or if it does, probably
      // we should do something special to fix it?
      console.warn(
        `process mouse -- weird, we clicked on surface ${wid} but can't find it`
      );
      return;
    }

    const topwindow: number = surface.wid;
    const modifiers: string[] = this.keyboard.modifiers(ev);

    switch (ev.type) {
      case "mousemove": {
        const mouse = getMouse(ev, surface);
        if (mouse == null) {
          return;
        }
        const { x, y, buttons } = mouse;

        this.send("pointer-position", topwindow, [x, y], modifiers, buttons);
        break;
      }

      case "mousedown":
      case "mouseup": {
        const pressed = ev.type === "mousedown";
        const mouse = getMouse(ev, surface);
        if (mouse == null) {
          return;
        }
        const { x, y, button, buttons } = mouse;

        this.send(
          "button-action",
          topwindow,
          button,
          pressed,
          [x, y],
          modifiers,
          buttons
        );
        break;
      }

      case WHEEL_EVENT_NAME: {
        const mouse = getMouse(ev, surface);
        if (mouse == null) {
          return;
        }
        // TODO: not implemented yet
        return;
      }
    }
    return surface;
  }
}

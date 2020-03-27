/*
 * CoCalc's Xpra HTML Client
 *
 * ---
 *
 * Xpra
 * Copyright (c) 2013-2017 Antoine Martin <antoine@devloop.org.uk>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015-2016 Spikes, Inc.
 * Copyright (c) 2018-2019 SageMath, Inc.
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 */
/**
 * CoCalc Xpra Client
 */

import { Surface } from "./surface";
import { Keyboard } from "./keyboard";

function get_wheel_event_name(): string {
  const element = document.createElement("div");
  for (const name of ["wheel", "mousewheel", "DOMMouseScroll"]) {
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

// normalize_wheel: https://github.com/facebook/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js
// BSD license

import { PIXEL_STEP, LINE_HEIGHT, PAGE_HEIGHT } from "./constants";

function normalize_wheel(
  ev: any
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

  ev = (ev as any).originalEvent;
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
    deltaMode: ev.deltaMode || 0,
  };
}

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
  if (right === left || top === bottom) {
    // degenerate size
    return;
  }

  const x = Math.round(
    surface.canvas.width * ((ev.clientX - left) / (right - left)) + surface.x
  );
  const y = Math.round(
    surface.canvas.height * ((ev.clientY - top) / (bottom - top)) + surface.y
  );

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
  private wheel_delta_x: number = 0;
  private wheel_delta_y: number = 0;

  constructor(send: Function, keyboard: Keyboard, findSurface: Function) {
    this.send = send;
    this.keyboard = keyboard;
    this.findSurface = findSurface;
  }

  process(ev: MouseEvent): Surface | undefined {
    if (ev.clientX == null || ev.clientY == null) {
      // happens with touch events for now...
      return;
    }
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

    const modifiers: string[] = this.keyboard.modifiers(ev);
    const mouse = getMouse(ev, surface);
    if (mouse == null) {
      return;
    }
    const { x, y, button, buttons } = mouse;

    switch (ev.type) {
      case "mousemove": {
        this.send("pointer-position", wid, [x, y], modifiers, buttons);
        break;
      }

      case "mousedown":
      case "mouseup": {
        const pressed = ev.type === "mousedown";
        surface.do_close_on_click();

        this.send(
          "button-action",
          wid,
          button,
          pressed,
          [x, y],
          modifiers,
          buttons
        );
        break;
      }

      case WHEEL_EVENT_NAME: {
        this.do_window_mouse_scroll({ ev, wid, x, y, buttons, modifiers });
        return;
      }
    }
    return surface;
  }

  do_window_mouse_scroll({
    ev,
    wid,
    x,
    y,
    buttons,
    modifiers,
  }: {
    ev: MouseEvent;
    wid: number;
    x: number;
    y: number;
    buttons: number[];
    modifiers: string[];
  }): void {
    // I think server support for wheel.precise is not available in
    // CoCalc -- I think it depends on the uinput Python module,
    // and won't work without kernel support that is not allowed by
    // Docker for security reasons.  So we instead "send
    // synthetic click+release as many times as needed".
    const wheel = normalize_wheel(ev);

    const INCREMENT = 120;
    //clamp to prevent event floods:
    const px = Math.min(INCREMENT * 10, wheel.pixelX);
    const py = Math.min(INCREMENT * 10, wheel.pixelY);
    const apx = Math.abs(px);
    const apy = Math.abs(py);

    // Generate a single event if we can, or add to accumulators:
    if (apx >= 40 && apx <= 160) {
      this.wheel_delta_x = px > 0 ? INCREMENT : -INCREMENT;
    } else {
      this.wheel_delta_x += px;
    }
    if (apy >= 40 && apy <= 160) {
      this.wheel_delta_y = py > 0 ? INCREMENT : -INCREMENT;
    } else {
      this.wheel_delta_y += py;
    }
    // Send synthetic click+release as many times as needed:
    let wx = Math.abs(this.wheel_delta_x);
    let wy = Math.abs(this.wheel_delta_y);
    const btn_x = this.wheel_delta_x >= 0 ? 6 : 7;
    const btn_y = this.wheel_delta_y >= 0 ? 5 : 4;

    while (wx >= INCREMENT) {
      wx -= INCREMENT;
      this.send("button-action", wid, btn_x, true, [x, y], modifiers, buttons);
      this.send("button-action", wid, btn_x, false, [x, y], modifiers, buttons);
    }
    while (wy >= INCREMENT) {
      wy -= INCREMENT;
      this.send("button-action", wid, btn_y, true, [x, y], modifiers, buttons);
      this.send("button-action", wid, btn_y, false, [x, y], modifiers, buttons);
    }
    // Store left overs:
    this.wheel_delta_x = this.wheel_delta_x >= 0 ? wx : -wx;
    this.wheel_delta_y = this.wheel_delta_y >= 0 ? wy : -wy;
  }
}

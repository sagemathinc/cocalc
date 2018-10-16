/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */

import { PIXEL_STEP, LINE_HEIGHT, PAGE_HEIGHT } from "./constants.js";

const wheelEventName = (() => {
  const element = document.createElement("div");
  const names = ["wheel", "mousewheel", "DOMMouseScroll"];

  return names.find(name => {
    const n = `on${name}`;

    element.setAttribute(n, "return;");

    return typeof element[n] === "function";
  });
})();

const normalizeWheel = ev => {
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
};

const getMouseButton = ev => {
  let button = ev.which
    ? Math.max(0, ev.which)
    : ev.button ? Math.max(0, ev.button) + 1 : 0;

  if (button === 4) {
    button = 8;
  } else if (button === 5) {
    button = 9;
  }

  return button;
};

const calculateWheel = (() => {
  let wheel_delta_x = 0;
  let wheel_delta_y = 0;

  return (ev, callback, callbackPrecise) => {
    const wheel = normalizeWheel(ev);

    // clamp to prevent event floods:
    let px = Math.min(1200, wheel.pixelX);
    let py = Math.min(1200, wheel.pixelY);
    let apx = Math.abs(px);
    let apy = Math.abs(py);

    /* TODO
    if (this.server_precise_wheel) {
      if (apx>0) {
        let btn_x = (px>=0) ? 6 : 7;
        let xdist = Math.round(px*1000/120);
        this.send(["wheel-motion", wid, btn_x, -xdist,
          (x, y), modifiers, buttons]);
      }
      if (apy>0) {
        let btn_y = (py>=0) ? 5 : 4;
        let ydist = Math.round(py*1000/120);
        this.send(["wheel-motion", wid, btn_y, -ydist,
          (x, y), modifiers, buttons]);
      }
      return;
    }
    */

    // generate a single event if we can, or add to accumulators:
    if (apx >= 40 && apx <= 160) {
      wheel_delta_x = px > 0 ? 120 : -120;
    } else {
      wheel_delta_x += px;
    }

    if (apy >= 40 && apy <= 160) {
      wheel_delta_y = py > 0 ? 120 : -120;
    } else {
      wheel_delta_y += py;
    }

    // send synthetic click+release as many times as needed:
    let wx = Math.abs(wheel_delta_x);
    let wy = Math.abs(wheel_delta_y);
    const btn_x = wheel_delta_x >= 0 ? 6 : 7;
    const btn_y = wheel_delta_y >= 0 ? 5 : 4;

    while (wx >= 120) {
      wx -= 120;
      callback(btn_x);
    }

    while (wy >= 120) {
      wy -= 120;
      callback(btn_y);
    }

    // store left overs:
    wheel_delta_x = wheel_delta_x >= 0 ? wx : -wx;
    wheel_delta_y = wheel_delta_y >= 0 ? wy : -wy;
  };
})();

const getMouse = (ev, surface) => {
  let relX = 0;
  let relY = 0;

  if (surface) {
    const { top, left } = surface.canvas.getBoundingClientRect();

    relX = left - surface.x;
    relY = top - surface.y;
  }

  let x = parseInt(ev.clientX - relX, 10);
  let y = parseInt(ev.clientY - relY, 10);
  const buttons = [];
  const button = getMouseButton(ev);
  x = Math.round(x * window.devicePixelRatio);
  y = Math.round(y * window.devicePixelRatio);

  return { x, y, button, buttons };
};

/**
 * Crates the mouse input handler
 */
export const createMouse = (send, keyboard) => {
  const scroll = (topwindow, x, y, modifiers, buttons) => pos => {
    send("button-action", topwindow, pos, true, [x, y], modifiers, buttons);
    send("button-action", topwindow, pos, false, [x, y], modifiers, buttons);
  };

  const preciseScroll = () => {
    // TODO
  };

  const process = (ev, surface) => {
    const topwindow = surface ? surface.wid : 0;
    const modifiers = keyboard.modifiers(ev);

    if (ev.type === "mousemove") {
      const { x, y, buttons } = getMouse(ev, surface);

      send("pointer-position", topwindow, [x, y], modifiers, buttons);
    } else if (ev.type === "mousedown" || ev.type === "mouseup") {
      const pressed = ev.type === "mousedown";
      const { x, y, button, buttons } = getMouse(ev, surface);

      send(
        "button-action",
        topwindow,
        button,
        pressed,
        [x, y],
        modifiers,
        buttons
      );
    } else if (ev.type === wheelEventName) {
      const { x, y, buttons } = getMouse(ev, surface);
      const s = scroll(topwindow, x, y, modifiers, buttons);
      const ps = preciseScroll();

      calculateWheel(ev, s, s, ps);
    }
  };

  return { process };
};

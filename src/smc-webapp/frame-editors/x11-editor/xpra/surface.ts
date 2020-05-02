/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
// Never resize beyond this (since it's the backend size)
export const MAX_WIDTH = 4000;
export const MAX_HEIGHT = 3000;

// Also, very bad things happen if a canvas ever has width or height 0.
export const MIN_WIDTH = 10;
export const MIN_HEIGHT = 10;

import { Renderer } from "./renderer";

export class Surface {
  public wid: number;
  public x: number;
  public y: number;
  public w: number; // width of the actual window on the xpra server
  public h: number; // height of the actual window on the xpra server
  public parent: Surface | undefined;
  public is_overlay: boolean = false;
  public canvas: HTMLCanvasElement;
  public jq_canvas: JQuery;
  public context: CanvasRenderingContext2D;
  public metadata: { title?: string };
  public properties: any;
  public renderer: Renderer;
  public scale: number = 1;
  private send: Function;
  public rescale_params: { scale: number; width?: number; height?: number };
  public _close_on_click?: Set<number>;

  constructor({
    parent,
    wid,
    x,
    y,
    w,
    h,
    metadata,
    properties,
    send,
    is_overlay,
  }) {
    this.parent = parent;
    this.is_overlay = is_overlay;
    this.send = send;

    this.canvas = document.createElement("canvas");
    this.jq_canvas = $(this.canvas);

    if (this.parent == null) {
      this.jq_canvas.css({ "max-width": "100%", "max-height": "100%" });
    }

    this.w = this.canvas.width = w;
    this.h = this.canvas.height = h;

    this.wid = wid;
    this.x = x;
    this.y = y;

    this.properties = properties;
    this.metadata = metadata;

    if (
      parent &&
      metadata &&
      metadata["transient-for"] &&
      metadata["window-type"] &&
      metadata["window-type"][0] === "DIALOG"
    ) {
      parent.close_on_click(wid);
    }

    // TODO: canvas.wid is used for handling mouse events.
    // This is a *temporary hack*!
    (this.canvas as any).wid = wid;

    const context = this.canvas.getContext("2d");
    if (!context) {
      throw Error("unable to get 2d canvas context");
    }
    this.context = context;
    this.renderer = new Renderer(
      { wid: this.wid, canvas: this.canvas, context: this.context },
      send
    );
    // console.log("new Surface", this);
  }

  // close wid when this surface is clicked on.
  close_on_click(wid: number): void {
    if (this._close_on_click === undefined) {
      this._close_on_click = new Set([wid]);
    } else {
      this._close_on_click.add(wid);
    }
  }

  do_close_on_click(): void {
    if (this._close_on_click === undefined) {
      return;
    }
    for (const wid of this._close_on_click) {
      this.send("close-window", wid);
    }
    delete this._close_on_click;
  }

  draw(...args): void {
    this.renderer.push(...args);
  }

  updateMetadata(meta): void {
    Object.assign(this.metadata, meta);
  }

  destroy(): void {
    if (this.canvas === undefined) {
      // already destroyed?
      return;
    }
    this.renderer.stop();
    delete this.renderer;
    delete this.canvas;
    this.jq_canvas.remove(); // remove from DOM.
    delete this.jq_canvas;
    delete this.parent;
  }

  updateGeometry(swidth: number, sheight: number, scale: number): void {
    if (this.renderer == null) {
      return; // destroyed
    }
    // The main canvas itself has its size updated *only* when
    // the render itself happens, so there is no flicker.
    if (this.renderer.drawCanvas.width != swidth) {
      this.renderer.drawCanvas.width = swidth;
    }
    if (this.renderer.drawCanvas.height != sheight) {
      this.renderer.drawCanvas.height = sheight;
    }

    //console.log("updateGeometry", this.wid, swidth, sheight, scale);
    const size_constraints = this.metadata["size-constraints"];
    const maximized = !(size_constraints && size_constraints["maximum-size"]);
    if (this.parent == null && maximized) {
      this.jq_canvas.css("width", "100%");
    } else {
      this.jq_canvas.css("width", swidth / scale);
      this.jq_canvas.css("left", this.x / scale);
    }
    if (this.parent == null && maximized) {
      this.jq_canvas.css("height", "100%");
    } else {
      this.jq_canvas.css("height", sheight / scale);
      this.jq_canvas.css("top", this.y / scale);
    }
  }

  // Rescale the window to better fit the user's frame.
  // Here width and height (if given) are the dimensions of
  // that frame, so they are the maximum possible size.
  // Scale accounts for retina/HiDPI displays, or user zoom.
  rescale(scale: number, width: number, height: number): void {
    //console.log("rescale", this.wid, scale, width, height);
    if (this.renderer == null) {
      return; // destroyed
    }
    this.rescale_params = { scale, width, height };
    let swidth = Math.round(width * scale);
    let sheight = Math.round(height * scale);

    const size_constraints = this.metadata["size-constraints"];
    if (size_constraints != null) {
      const mn = size_constraints["minimum-size"];
      if (mn != null) {
        if (swidth < mn[0]) {
          swidth = mn[0];
        }
        if (sheight < mn[1]) {
          sheight = mn[1];
        }
      }

      const mx = size_constraints["maximum-size"];
      if (mx != null) {
        if (swidth > mx[0]) {
          swidth = mx[0];
        }
        if (sheight > mx[1]) {
          sheight = mx[1];
        }
      }
    }

    // Never resize beyond the backend compositor size, since bad
    // things happen when window is slightly off screen. Very frustrating
    // for users.
    if (sheight > MAX_HEIGHT) {
      sheight = MAX_HEIGHT;
    }
    if (swidth > MAX_WIDTH) {
      swidth = MAX_WIDTH;
    }
    if (sheight < MIN_HEIGHT) {
      sheight = MIN_HEIGHT;
    }
    if (swidth < MIN_WIDTH) {
      swidth = MIN_WIDTH;
    }

    // console.log("resize_window ", this.wid, width, height, swidth, sheight);
    this.updateGeometry(swidth, sheight, scale);

    this.scale = scale;
    this.w = swidth;
    this.h = sheight;
    if (!this.is_overlay && this.parent != null) {
      // center (modal) window over parent -- most useful.
      const parent: Surface = this.parent;
      this.x = Math.round(parent.x + (parent.w - this.w) / 2);
      this.y = Math.round(parent.y + (parent.h - this.h) / 2);
    }

    if (!this.is_overlay) {
      // console.log("sending ", this.wid, this.w, this.h);
      this.send(
        "configure-window",
        this.wid,
        this.x,
        this.y,
        this.w,
        this.h,
        this.properties
      );
    }
  }
}

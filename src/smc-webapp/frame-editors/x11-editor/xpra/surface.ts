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
  public w: number;
  public h: number;
  public parent: Surface | undefined;
  public overlay: boolean = false;
  public is_dialog: boolean = false;
  public canvas: HTMLCanvasElement;
  public jq_canvas: JQuery;
  public context: CanvasRenderingContext2D;
  public metadata: { title?: string };
  public properties: any;
  public renderer: Renderer;
  public scale: number = 1; // TODO: set this properly!

  constructor({ parent, wid, x, y, w, h, metadata, properties, send }) {
    this.parent = parent;
    this.overlay = !!parent;
    this.canvas = document.createElement("canvas");
    this.jq_canvas = $(this.canvas);
    this.wid = wid;
    this.w = this.canvas.width = w;
    this.h = this.canvas.height = h;
    this.x = x;
    this.y = y;
    this.properties = properties;
    this.metadata = metadata;

    // TODO: canvas.wid is used for handling mouse events.
    // This is a *temporary hack*!
    (this.canvas as any).wid = wid;

    if (
      metadata["window-type"] != null &&
      metadata["window-type"][0] === "DIALOG"
    ) {
      this.is_dialog = true;
      this.jq_canvas.css({
        border: "1px solid lightgrey",
        boxShadow: "3px 3px 3px lightgrey"
      });
    }

    const context = this.canvas.getContext("2d");
    if (!context) {
      throw Error("unable to get 2d canvas context");
    }
    this.context = context;
    this.renderer = new Renderer(
      { wid: this.wid, canvas: this.canvas, context: this.context },
      send
    );
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

  updateGeometry(
    w: number,
    h: number,
    full_width: boolean,
    full_height: boolean
  ): void {
    // The main canvas itself has its size updated *only* when
    // the render itself happens, so there is no flicker.
    if (this.renderer.drawCanvas.width != w) {
      this.renderer.drawCanvas.width = w;
    }
    if (this.renderer.drawCanvas.height != h) {
      this.renderer.drawCanvas.height = h;
    }

    // No matter what, never have part of the window off screen, since
    // there is no possible way to see it in a tabbed no-drag interface.
    this.jq_canvas.css({ "max-width": "100%", "max-height": "100%" });

    if (full_width && !this.is_dialog) {
      this.jq_canvas.css("width", "100%");
    }
    if (full_height && !this.is_dialog) {
      this.jq_canvas.css("height", "100%");
    }
  }

  rescale(scale: number, width?: number, height?: number):  void {
    if (width === undefined) {
      width = this.w;
    }
    if (height === undefined) {
      height = this.h;
    }

    if (this.scale === scale && width === this.w && height === this.h) {
      // absolutely no change at all.
      return;
    }

    this.scale = scale;

    let swidth0, sheight0;
    let swidth = (swidth0 = Math.round(width * scale));
    let sheight = (sheight0 = Math.round(height * scale));

    // In some cases, we will only potentially SHRINK (so buttons can be seen!),
    // but not enlarge, which is usually really annoying.
    if (
      this.metadata != null &&
      this.metadata["window-type"] != null &&
      this.metadata["window-type"][0] === "DIALOG"
    ) {
      if (swidth >= this.w) {
        swidth = this.w;
      }
      if (sheight >= this.h) {
        sheight = this.h;
      }
    }

    // Honor any size constraints
    const size_constraints = this.metadata["size-constraints"];
    if (size_constraints != null) {
      const mn = size_constraints["minimum-size"],
        mx = size_constraints["maximum-size"];
      if (mn != null) {
        if (swidth < mn[0]) {
          swidth = mn[0];
        }
        if (sheight < mn[1]) {
          sheight = mn[1];
        }
      }
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

    //console.log("resize_window ", wid, width, height, swidth, sheight);
    this.updateGeometry(
      swidth,
      sheight,
      swidth0 === swidth,
      sheight0 === sheight
    );

    // w and h are critically used for scaling/mouse position computation,
    // so MUST be updated.
    this.w = swidth;
    this.h = sheight;
  }
}

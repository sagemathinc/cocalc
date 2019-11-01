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
/*
CoCalc -- Xpra HTML Client

The Renderer object.   Periodically clears the queue of
stuff that needs to be rendered.
*/
import { arraybufferBase64, timestamp } from "./util";

import { lz4decode } from "./util";
import { inflateSync } from "zlibjs";
import { delay } from "awaiting";

export class Renderer {
  private listening: boolean = true;
  private paintQueue: any[] = [];
  private wid: number;
  public drawCanvas: HTMLCanvasElement;
  public drawContext: CanvasRenderingContext2D;
  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;
  private send: Function;
  private delay: number = 50;

  constructor({ wid, canvas, context }, send) {
    this.drawCanvas = document.createElement("canvas");

    this.drawCanvas.width = canvas.width;
    this.drawCanvas.height = canvas.height;

    const drawContext = this.drawCanvas.getContext("2d");
    if (drawContext == null) {
      throw Error("unable to get draw context");
    }
    this.drawContext = drawContext;
    this.drawContext.imageSmoothingEnabled = false;

    this.canvas = canvas;
    this.context = context;

    this.wid = wid;
    this.send = send;

    this.push = this.push.bind(this);
    this.stop = this.stop.bind(this);
    this.render = this.render.bind(this);

    window.requestAnimationFrame(this.render);
  }

  private async render(): Promise<void> {
    if (!this.listening) {
      // Stop rendering -- we're done.
      return;
    }

    if (this.paintQueue.length === 0) {
      // Check again later, with exponential backoff to avoid wasting resources
      // e.g., when this is a background tab or nothing happening on this surface.
      // NOTE: in upstream client this is called ASAP, which wastes a lot
      // of resources.
      this.delay = Math.min(1000, this.delay * 1.3);
      await delay(this.delay);
      window.requestAnimationFrame(this.render);
      return;
    } else {
      this.delay = 25; // reset delay
    }

    const [start, packet] = this.paintQueue.shift();
    const now = timestamp();
    const diff = now - start;

    let [x, y, w, h, coding, data, sequence, rowstride, options] = packet;

    options = options || {};

    try {
      await this.paint({
        x,
        y,
        w,
        h,
        coding,
        data,
        sequence,
        rowstride,
        options
      });
      this.send("damage-sequence", sequence, this.wid, w, h, diff, "");
    } catch (err) {
      console.warn("renderer error --", err);
      this.send("damage-sequence", sequence, this.wid, w, h, -1, "");
    }

    this.set_size();
    this.copy_to_screen();

    window.requestAnimationFrame(this.render);
  }

  push(...args): void {
    this.paintQueue.push([timestamp(), args]);
  }

  stop(): void {
    this.listening = false;
  }

  private async paint(packet): Promise<void> {
    const { coding, options } = packet;

    if (options.scaled_size) {
      packet.w = options.scaled_size[0];
      packet.h = options.scaled_size[1];
    }

    switch (coding) {
      case "jpeg":
      case "png":
      case "webp":
        await this.render_raw_image(packet);
        break;
      case "rgb32":
        this.render_rgb_image(packet);
        break;
      case "mpeg1":
        console.warn("Skipping frame using", coding); // TODO
        break;
      case "h264":
        console.warn("Skipping frame using", coding); // TODO
        break;
      case "h264+mp4":
      case "vp8+webm":
      case "mpeg4+mp4":
        console.warn("Skipping frame using", coding); // TODO
        break;
      case "scroll":
        this.render_scroll(packet);
        break;
      default:
        console.warn("Skipping frame using *unknown* coding", coding);
    }
  }

  // Update main canvas size if necessary -- we do this here
  // right when we are copying the drawCanvas over, to avoid
  // any flicker.
  private set_size(): void {
    if (
      this.canvas.width != this.drawCanvas.width ||
      this.canvas.height != this.drawCanvas.height
    ) {
      this.canvas.width = this.drawCanvas.width;
      this.canvas.height = this.drawCanvas.height;
    }
  }

  // Set the main visible canvas equal to the off-screen drawCanvas.
  private copy_to_screen(): void {
    this.context.drawImage(this.drawCanvas, 0, 0);
  }

  private async render_raw_image({ x, y, coding, data }): Promise<void> {
    const imageData = arraybufferBase64(data);
    const img = new Image();

    // This will wait until the image is loaded or there is an error loading it
    // (in which case an exception is raised).
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:image/${coding};base64,${imageData}`;
    });

    // Check that dimensions are valid.
    if (img.width <= 0 || img.height <= 0) {
      throw Error(`Invalid image size ${img.width}x${img.height}`);
    }

    // Finally render the image into the draw canvas.
    this.drawContext.drawImage(img, x, y);
  }

  private render_rgb_image({ x, y, w, h, data, options }): void {
    const img = this.drawContext.createImageData(w, h);

    if (options.zlib > 0) {
      data = inflateSync(data);
    } else if (options.lz4 > 0) {
      const { uncompressedSize, inflated } = lz4decode(data);
      data = inflated.slice(0, uncompressedSize);
    }

    if (data.length > img.data.length) {
      throw Error("render_rgb_image: Data size mismatch");
    }

    img.data.set(data);
    this.drawContext.putImageData(img, x, y);
  }

  private render_scroll({ data }): void {
    for (let i = 0; i < data.length; i++) {
      const [sx, sy, sw, sh, xdelta, ydelta] = data[i];

      this.drawContext.drawImage(
        this.canvas,
        sx,
        sy,
        sw,
        sh,
        sx + xdelta,
        sy + ydelta,
        sw,
        sh
      );
    }
  }
}

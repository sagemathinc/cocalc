/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */
import { timestamp } from "./util.js";
import { rgbImageRenderer } from "./renderer/rgb.js";
import { rawImageRenderer } from "./renderer/image.js";

const scroll = ({ x, y, w, h, data }) => (
  { drawContext, canvas },
  callback
) => {
  for (let i = 0, j = data.length; i < j; ++i) {
    const [sx, sy, sw, sh, xdelta, ydelta] = data[i];

    drawContext.drawImage(
      canvas,
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

  callback();
};

const paint = (surface, callback) => packet => {
  let { w, h, coding, options } = packet;

  const newPacket = Object.assign({}, packet, {
    w: options.scaled_size ? options.scaled_size[0] : w,
    h: options.scaled_size ? options.scaled_size[1] : h
  });

  let renderer;
  if (["jpeg", "png", "webp"].indexOf(coding) !== -1) {
    renderer = rawImageRenderer(newPacket);
  } else if (coding === "rgb32") {
    renderer = rgbImageRenderer(newPacket);
  } else if (coding === "mpeg1") {
    console.warn("Skippet frame using", coding); // TODO
  } else if (coding === "h264") {
    console.warn("Skippet frame using", coding); // TODO
  } else if (["h264+mp4", "vp8+webm", "mpeg4+mp4"].indexOf(coding) !== -1) {
    console.warn("Skippet frame using", coding); // TODO
  } else if (coding === "scroll") {
    renderer = scroll(newPacket);
  }

  if (renderer) {
    renderer(surface, callback);
  }
};

/**
 * Creates a surface renderer
 */
export const createRenderer = ({ wid, canvas, context }, send) => {
  let listening = true;
  let paintQueue = [];

  const drawCanvas = document.createElement("canvas");
  drawCanvas.width = canvas.width;
  drawCanvas.height = canvas.height;

  const drawContext = drawCanvas.getContext("2d");
  drawContext.imageSmoothingEnabled = false;

  const surface = { canvas, context, drawCanvas, drawContext };

  const render = () => {
    if (!listening) {
      return;
    } else if (paintQueue.length === 0) {
      window.requestAnimationFrame(render);
    } else {
      const [start, packet] = paintQueue.shift();
      const now = timestamp();
      const diff = now - start;

      if (diff > 5000) {
        console.warn("A frame was very late....");

        /* FIXME
        window.requestAnimationFrame(render);
        return;
        */
      }

      let [x, y, w, h, coding, data, sequence, rowstride, options] = packet;
      options = options || {};

      const args = Object.freeze({
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

      paint(surface, (err, options) => {
        if (err) {
          console.warn(err);
          send("damage-sequence", sequence, wid, w, h, -1, "");
        } else {
          send("damage-sequence", sequence, wid, w, h, diff, "");
        }

        context.drawImage(drawCanvas, 0, 0);

        window.requestAnimationFrame(render);
      })(args);
    }
  };

  window.requestAnimationFrame(render);

  return {
    push: (...args) => paintQueue.push([timestamp(), args]),
    stop: () => (listening = false),
    surface
  };
};

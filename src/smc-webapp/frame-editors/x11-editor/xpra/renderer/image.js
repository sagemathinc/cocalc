/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */
import { arraybufferBase64 } from "../util.js";

export const rawImageRenderer = ({ x, y, w, h, coding, data }) => (
  { drawContext },
  callback
) => {
  const imageData = arraybufferBase64(data);
  const img = new Image();

  img.onload = ev => {
    if (img.width === 0 || img.height === 0) {
      callback("Invalid image size");
    } else {
      drawContext.drawImage(img, x, y);

      callback();
    }
  };

  img.onerror = ev => callback("Image failed to load: " + coding);
  img.src = `data:image/${coding};base64,${imageData}`;
};

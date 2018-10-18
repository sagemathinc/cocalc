/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */
import { arraybufferBase64 } from "../util.js";

export const iconRenderer = ({ coding, data }) => {
  if (coding === "png") {
    const src = `data:image/${coding};base64,` + arraybufferBase64(data);

    return src;
  }

  return "about:blank"; // FIXME
};

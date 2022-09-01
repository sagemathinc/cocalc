// Given a URL to an image, returns a string like this:
//     " data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."

import { callback } from "awaiting";

export default async function imageToDataURL(
  src: string, // url to an image
  width: number,
  height: number,
  type?: string, // use "image/png" if you want a png
  encoderOptions?: number // 0 - 1; impacts compression -- see https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL
): Promise<string> {
  const img = new Image();
  img.src = src;
  await callback((cb) => {
    img.onload = () => {
      cb();
    };
  });
  img.width = width;
  img.height = height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx == null) {
    throw Error("failed to get 2d canvas");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0, img.width, img.height);
  return canvas.toDataURL(type, encoderOptions);
}

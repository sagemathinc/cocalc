import NextImage from "next/image";
import { MediaURL } from "./util";
import basePath from "lib/base-path";
import { join } from "path";
import { CSSProperties } from "react";

// copied from https://github.com/vercel/next.js/blob/eb871d30915d668dd9ba897d4d04ced207ce2e6d/packages/next/image-types/global.d.ts
// since it seems not exported...
export interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
}

interface Props {
  src: string | StaticImageData;
  style?: CSSProperties;
  alt?: string;
  width?: number;
}

export default function Image({ src, style, alt, width }: Props) {
  if (typeof src == "string") {
    return (
      <img
        src={MediaURL(src)}
        style={{ ...style, maxWidth: "100%" }}
        alt={alt}
        width={width}
      />
    );
  }
  if (basePath.length > 1 && !src.src.startsWith(basePath)) {
    // This is a hack to workaround the very annoying fact that
    // next/image does NOT properly support the nextjs basePath
    // option.  This is definitely a bug in nextjs, and when it
    // gets fixed, this workaround will break our site!
    // The next/image implementation is in packages/next/client/image.tsx of nextjs itself.
    // Here's the issue: https://github.com/vercel/next.js/issues/22244
    src.src = join(basePath, src.src);
  }
  return (
    <div
      style={{
        width: "100%",
        ...style,
        display: "inline-block",
      }}
    >
      <div style={{ position: "relative", width: "100%" }}>
        <NextImage src={src} alt={alt} layout="responsive" width={width} />
      </div>
    </div>
  );
}

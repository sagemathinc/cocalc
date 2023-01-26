/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import NextImage from "next/legacy/image";
import { join } from "path";
import { CSSProperties } from "react";

import basePath from "lib/base-path";
import { MediaURL } from "./util";

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
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export default function Image(props: Props) {
  const { src, style, alt, width, height, priority = false } = props;
  if (typeof src === "string") {
    return (
      <img
        src={MediaURL(src)}
        style={{ ...style, maxWidth: "100%" }}
        alt={alt}
        width={width}
        height={height}
      />
    );
  }
  if (basePath.length > 1 && !src.src?.startsWith(basePath)) {
    // This is a hack to workaround the very annoying fact that
    // next/image does NOT properly support the nextjs basePath
    // option.  This is definitely a bug in nextjs, and when it
    // gets fixed, this workaround will break our site!
    // The next/image implementation is in packages/next/client/image.tsx of nextjs itself.
    // Here's the issue: https://github.com/vercel/next.js/issues/22244
    src.src = join(basePath, src.src);
  }
  if (height != null && width != null) {
    return (
      <NextImage
        src={src}
        alt={alt}
        height={height}
        width={width}
        priority={priority}
      />
    );
  } else {
    return (
      <div
        style={{
          width: "100%",
          ...style,
          display: "inline-block",
        }}
      >
        <div style={{ position: "relative", width: "100%" }}>
          <NextImage
            src={src}
            alt={alt}
            layout="responsive"
            width={width}
            priority={priority}
          />
        </div>
      </div>
    );
  }
}

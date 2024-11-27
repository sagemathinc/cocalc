/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// NOTE -- at this point, I'm completely giving up on next's image
// for now. It's always broken and the api keeps changing and it's
// too hard to work with.
// import NextImage from "next/image";

import { CSS } from "components/misc";
import { MediaURL, SHADOW } from "./util";

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
  style?: CSS;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  shadow?: boolean;
}



export default function Image(props: Props) {
  const { src, style, alt, width, height, shadow = false } = props;

  const imgStyle: CSS = {
    ...style,
    ...(shadow ? SHADOW : {}),
    maxWidth: "100%",
  } as const;

  if (typeof src === "string") {
    return (
      <img
        src={MediaURL(src)}
        style={imgStyle}
        alt={alt}
        width={width}
        height={height}
      />
    );
  }

  //   if (height != null && width != null) {
  //     return (
  //       <NextImage
  //         src={src.src}
  //         alt={alt}
  //         height={height}
  //         width={width}
  //         priority={priority}
  //       />
  //     );
  //   }

  if (width != null) {
    return (
      <img
        src={src.src}
        height={height}
        width={width}
        alt={alt}
        style={imgStyle}
      />
    );
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
        <img
          src={src.src}
          height={height}
          width={width}
          alt={alt}
          style={imgStyle}
        />
      </div>
    </div>
  );
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";
import React from "react";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";

interface ImageProps {
  type: string;
  sha1?: string; // one of sha1 or value must be given
  value?: string;
  width?: number;
  height?: number;
  actions?;
}

export const Image: React.FC<ImageProps> = React.memo((props: ImageProps) => {
  const { actions, type, sha1, value, width, height } = props;

  const is_mounted = useIsMountedRef();

  const { val: attempts, inc: inc_attempts } = useCounter(0);

  async function load_error(): Promise<void> {
    if (attempts < 5 && is_mounted.current) {
      await delay(500);
      if (!is_mounted.current) return;
      inc_attempts();
    }
  }

  function extension(): string {
    return type.split("/")[1].split("+")[0];
  }

  function render_image(src, on_error?): JSX.Element {
    const props = {
      src,
      width,
      height,
    };
    props["style"] = {
      maxWidth: "100%",
      height: props.height ?? "auto",
    } as React.CSSProperties;
    if (on_error != null) {
      props["onError"] = on_error;
    }
    return <img {...props} alt="Image in a Jupyter notebook" />;
  }

  function renderSha1Blob(sha1: string): JSX.Element {
    console.log("renderSha1Blob", { sha1 });
    const blobs = actions?.blobs;
    const buf = blobs?.get(sha1);
    if (buf == null) {
      return <div>image not available</div>;
    }
    const { type } = blobs.headers(sha1);
    const blob = new Blob([buf], { type });
    const url = URL.createObjectURL(blob);
    // window.x = { blob, blobs, sha1, type, url, buf };
    return render_image(url, load_error);
  }

  function encoding(): string {
    switch (type) {
      case "image/svg+xml":
        return "utf8";
      default:
        return "base64";
    }
  }

  function render_locally(value: string): JSX.Element {
    // The encodeURIComponent is definitely necessary these days.
    // See https://github.com/sagemathinc/cocalc/issues/3197 and the comments at
    // https://css-tricks.com/probably-dont-base64-svg/
    const prefix = `data:${type};${encoding()}`;
    const src = `${prefix},${encodeURIComponent(value)}`;
    return render_image(src);
  }

  if (value != null) {
    return render_locally(value);
  } else if (sha1 != null) {
    return renderSha1Blob(sha1);
  } else {
    // not enough info to render
    return <span>[unavailable {extension()} image]</span>;
  }
});

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { once } from "@cocalc/util/async-utils";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { useEffect, useState } from "react";
import { Spin } from "antd";

interface ImageProps {
  type: string;
  sha1?: string; // one of sha1 or value must be given
  value?: string;
  width?: number;
  height?: number;
  actions?;
}

function renderImage({
  src,
  on_error,
  width,
  height,
}: {
  src: string;
  width?;
  height?;
  on_error?;
}): JSX.Element {
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

export function Image(props: ImageProps) {
  const { type, value, width, height } = props;

  function extension(): string {
    return type.split("/")[1].split("+")[0];
  }

  function encoding(): string {
    switch (type) {
      case "image/svg+xml":
        return "utf8";
      default:
        return "base64";
    }
  }

  if (value != null) {
    // The encodeURIComponent is definitely necessary these days.
    // See https://github.com/sagemathinc/cocalc/issues/3197 and the comments at
    // https://css-tricks.com/probably-dont-base64-svg/
    const prefix = `data:${type};${encoding()}`;
    const src = `${prefix},${encodeURIComponent(value)}`;
    return renderImage({ src, width, height });
  } else if (props.sha1 && props.actions) {
    const { sha1, actions, width, height } = props;
    return (
      <RenderBlobImage
        sha1={sha1}
        width={width}
        height={height}
        actions={actions}
      />
    );
  } else {
    // not enough info to render
    return <span>[unavailable {extension()} image]</span>;
  }
}

function RenderBlobImage({
  sha1,
  actions,
  width,
  height,
}: {
  sha1: string;
  actions;
  width?;
  height?;
}) {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const isMounted = useIsMountedRef();
  useEffect(() => {
    (async () => {
      while (isMounted.current && !actions.is_closed()) {
        const blobs = actions.blobs;
        if (blobs) {
          try {
            const buf = blobs.get(sha1);
            if (buf != null) {
              const { type } = blobs.headers(sha1);
              const blob = new Blob([buf], { type });
              // TODO:memory leak!
              const src = URL.createObjectURL(blob);
              setSrc(src);
              break;
            }
          } catch {}
          await once(blobs, "change");
        } else {
          await delay(1000);
        }
      }
    })();
  }, [sha1]);
  if (src) {
    return renderImage({ src, width, height });
  } else {
    return <Spin delay={1000} />;
  }
}

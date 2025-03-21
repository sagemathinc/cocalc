/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { useEffect, useState } from "react";
import { Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import LRU from "lru-cache";

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
  src?: string;
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
    width: props.width,
    maxHeight: props.height ?? "auto",
    height: "auto",
    padding: src ? undefined : "15px",
    textAlign: "center",
  } as React.CSSProperties;
  if (on_error != null) {
    props["onError"] = on_error;
  }
  if (!src) {
    return (
      <div {...props}>
        <Spin delay={1000} />
      </div>
    );
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
    const { sha1, actions } = props;
    return (
      <RenderBlobImage
        sha1={sha1}
        width={width}
        height={height}
        actions={actions}
        type={type}
      />
    );
  } else {
    // not enough info to render
    return <span>[unavailable {extension()} image]</span>;
  }
}

const cache = new LRU<string, string>({
  max: 100,
  dispose: (url) => {
    URL.revokeObjectURL(url);
  },
});

function RenderBlobImage({
  sha1,
  actions,
  width,
  height,
  type,
}: {
  sha1: string;
  actions;
  width?;
  height?;
  type: string;
}) {
  const [error, setError] = useState<string>("");
  const [src, setSrc] = useState<string | undefined>(cache.get(sha1));
  const isMounted = useIsMountedRef();
  useEffect(() => {
    if (cache.has(sha1)) {
      setSrc(cache.get(sha1));
      return;
    }
    (async () => {
      let buf;
      try {
        buf = await actions.asyncBlobStore.get(sha1, { timeout: 5000 });
      } catch (err) {
        setError(`${err}`);
        return;
      }
      if (buf == null) {
        setError("Image not available");
        return;
      }
      const blob = new Blob([buf], { type });
      const src = URL.createObjectURL(blob);
      cache.set(sha1, src);
      if (isMounted.current && !actions.is_closed()) {
        setSrc(src);
      }
    })();
  }, [sha1]);

  if (error) {
    return (
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "5px 0" }}
      />
    );
  }
  return renderImage({ src, width, height });
}

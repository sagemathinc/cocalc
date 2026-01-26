/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import useBlob from "./use-blob";
import { useState } from "react";

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
}): React.JSX.Element {
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

  const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    console.warn("[Jupyter Image] Failed to load image:", src);
    if (on_error) {
      on_error(event);
    }
  };

  if (on_error != null) {
    props["onError"] = handleError;
  }
  if (!src) {
    return (
      <div {...props}>
        <Spin delay={500} />
      </div>
    );
  }
  return (
    <img {...props} alt="Image in a Jupyter notebook" onError={handleError} />
  );
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
  const src = useBlob({ sha1, actions, type, setError });

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

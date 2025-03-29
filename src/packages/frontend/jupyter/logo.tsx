/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The kernel's logo display
*/

import { useFileContext } from "@cocalc/frontend/lib/file-context";
import { filename_extension, getRandomColor } from "@cocalc/util/misc";
import { CSSProperties, useEffect, useState } from "react";
import { Spin } from "antd";

const DEFAULT_HEIGHT = 24; // this matches the rest of the status bar.

interface Props {
  kernel: string | null;
  size?: number;
  style?: CSSProperties;
  project_id?: string;
}

export default function Logo({
  kernel,
  size = DEFAULT_HEIGHT,
  style,
  project_id,
}: Props) {
  const fileContext = useFileContext();
  const { client } = fileContext;
  if (project_id == null) {
    project_id = fileContext.project_id;
  }
  if (!kernel || !project_id || !client) {
    return <FallbackLogo kernel={kernel} size={size} style={style} />;
  } else {
    return (
      <KernelLogo
        kernel={kernel}
        size={size}
        client={client}
        project_id={project_id}
        style={style}
      />
    );
  }
}

function FallbackLogo({
  kernel,
  size,
  style,
  title,
}: {
  kernel: string | null;
  size?;
  style?;
  title?;
}) {
  return (
    <div
      style={{
        fontSize: size,
        color: getRandomColor(kernel ?? "unknown"),
        display: "inline-block",
        width: size - 5,
        height: size - 5,
        lineHeight: 0.8,
        fontWeight: "bold",
        verticalAlign: "middle",
        ...style,
      }}
      title={title}
    >
      {kernel?.[0]?.toUpperCase() ?? ""}
    </div>
  );
}

function KernelLogo({ kernel, size, project_id, style, client }) {
  const { src, error } = useLogo({ kernel, project_id, client });

  if (error) {
    return <FallbackLogo kernel={kernel} size={size} title={error} />;
  }
  if (!src) {
    return <Spin delay={1000} />;
  }
  return <img src={src} style={{ width: size, height: size, ...style }} />;
}

interface Options {
  project_id: string;
  kernel: string;
  noCache?: boolean;
  client;
}

const cache: { [key: string]: string } = {};

async function getLogo({
  project_id,
  kernel,
  noCache,
  client,
}: Options): Promise<string> {
  const key = `${project_id}-${kernel}`;
  if (!noCache && cache[key]) {
    return cache[key];
  }
  const api = client.nats_client.projectApi({ project_id });
  const { filename, base64 } = await api.editor.jupyterKernelLogo(kernel, {
    noCache,
  });
  let type;
  if (filename.endsWith(".svg")) {
    type = "image/svg+xml";
  } else {
    type = `image/${filename_extension(filename)}`;
  }
  const prefix = `data:${type};base64`;
  const src = `${prefix},${encodeURIComponent(base64)}`;
  cache[key] = src;
  return src;
}

function useLogo(opts: Options) {
  const [src, setSrc] = useState<string>("");
  const [error, setError] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        setSrc(await getLogo(opts));
        setError("");
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [opts.kernel, opts.noCache, opts.project_id]);

  return { src, error, setError };
}

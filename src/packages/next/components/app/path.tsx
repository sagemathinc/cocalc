/*
Edit a file using the CoCalc app.
*/

import { CSSProperties } from "react";
import basePath from "lib/base-path";
import editURL from "lib/share/edit-url";
import { join } from "path";
import IFrame from "./iframe";

interface Props {
  project_id: string;
  path?: string;
  style?: CSSProperties;
  fullscreen?: boolean;
  embed?: boolean;
}

export default function Path({
  project_id,
  path,
  style,
  fullscreen,
  embed,
}: Props) {
  const appURL = editURL({ type: "collaborator", project_id, path });

  const src = embed
    ? join(
        basePath,
        `static/embed.html?target=projects/${project_id}/files/${path ?? ""}`
      )
    : appURL + "?fullscreen=project&session=";

  return (
    <IFrame
      src={src}
      appURL={appURL}
      path={path}
      style={style}
      fullscreen={fullscreen}
    />
  );
}

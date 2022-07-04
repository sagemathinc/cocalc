/*
Edit a file using the CoCalc app.
*/

import { Alert } from "antd";
import { CSSProperties } from "react";
import basePath from "lib/base-path";
import editURL from "lib/share/edit-url";
import { join } from "path";
import IFrame from "./iframe";
import useCustomize from "lib/use-customize";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import OpenAnonymously from "components/share/edit/open-anonymously";

interface Props {
  project_id: string;
  path?: string;
  style?: CSSProperties;
  fullscreen?: boolean;
  embed?: boolean;
  description?: string;
  start?: boolean; // if true, immediately load editor rather than waiting for user to click a button.
}

export default function Path({
  project_id,
  path,
  style,
  fullscreen,
  embed,
  description,
  start,
}: Props) {
  const { account, anonymousSignup } = useCustomize();

  if (!account) {
    return (
      <Alert
        type="success"
        style={style}
        message={
          <div>
            <InPlaceSignInOrUp title={`To use ${description ?? "this"}...`} />
            {anonymousSignup && <OpenAnonymously />}
          </div>
        }
      />
    );
  }

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
      description={description}
      start={start}
    />
  );
}

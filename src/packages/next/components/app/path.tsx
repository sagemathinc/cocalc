/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Edit a file using the CoCalc app.
*/

import { Alert } from "antd";
import { join } from "path";
import { CSSProperties } from "react";

import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import OpenAnonymously from "components/share/edit/open-anonymously";
import basePath from "lib/base-path";
import editURL from "lib/share/edit-url";
import useCustomize from "lib/use-customize";
import IFrame from "./iframe";

interface Props {
  description?: string;
  embed?: boolean;
  fullscreen?: boolean;
  path?: string;
  project_id: string;
  start?: boolean; // if true, immediately load editor rather than waiting for user to click a button.
  style?: CSSProperties;
}

export default function Path(props: Props) {
  const { project_id, path, style, fullscreen, embed, description, start } =
    props;

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

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Image viewer component -- for viewing standard image types.
*/

import { filename_extension } from "smc-util/misc";

import { React, useState } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import { MediaViewerButtonBar } from "./button-bar";
import { VIDEO_EXTS, IMAGE_EXTS, AUDIO_EXTS } from "../../file-associations";

interface Props {
  project_id: string;
  path: string;
}

export const MediaViewer: React.FC<Props> = ({ project_id, path }) => {
  // used to force reload when button explicitly clicked
  const [param, set_param] = useState<number>(0);

  // the URL to the file:
  let url = webapp_client.project_client.read_file({
    project_id,
    path,
  });
  if (param) {
    url += `?param=${param}`; // this forces reload whenever refresh button clicked
  }

  return (
    <div style={{ marginTop: "1px" }} className={"smc-vfill"}>
      <MediaViewerButtonBar refresh={() => set_param(Math.random())} />
      <div
        style={{
          overflowY: "auto",
          flex: 1,
          marginTop: "1px",
          padding: "1px",
          borderTop: "1px solid lightgray",
          textAlign: "center",
          background: "black",
        }}
      >
        <RenderMedia url={url} path={path} />
      </div>
    </div>
  );
};

function get_mode(path: string): string {
  const ext = filename_extension(path).toLowerCase();
  if (VIDEO_EXTS.includes(ext)) {
    return "video";
  }
  if (IMAGE_EXTS.includes(ext)) {
    return "image";
  }
  if (AUDIO_EXTS.includes(ext)) {
    return "audio";
  }
  console.warn(`Unknown media extension ${ext}`);
  return "";
}

const RenderMedia: React.FC<{ path: string; url: string }> = ({
  path,
  url,
}) => {
  switch (get_mode(path)) {
    case "image":
      return (
        <img src={url} style={{ maxWidth: "100%", background: "white" }} />
      );
    case "video":
      return (
        <video
          src={url}
          style={{ maxWidth: "100%" }}
          controls={true}
          autoPlay={true}
          loop={true}
        />
      );
    case "audio":
      return (
        <audio
          src={url}
          autoPlay={true}
          controls={true}
          loop={false}
          volume={0.5}
        />
      );
    default:
      // should never happen
      return (
        <div style={{ color: "white", fontSize: "200%" }}>Unknown type</div>
      );
  }
};

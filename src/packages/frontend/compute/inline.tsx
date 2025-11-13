/*
Simple inline display of the compute server with given id, for use
elsewhere in cocalc.

This may get more sophisticated, e.g., clickable link, hover for status, etc.
*/

import { useEffect, useState } from "react";
import getTitle from "./get-title";
import { Spin, Tooltip } from "antd";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { PROJECT_COLOR } from "./select-server";
import { trunc_middle } from "@cocalc/util/misc";

interface Props {
  id: number;
  noColor?: boolean;
  colorOnly?: boolean;
  style?;
  idOnly?: boolean;
  titleOnly?: boolean;
  prompt?: boolean;
  computeServer?; // immutable js object from store, if known
  colorLabel?; // put in middle of colorOnly
}

export default function ComputeServer({
  id,
  noColor,
  colorOnly,
  style,
  titleOnly,
  idOnly,
  prompt,
  computeServer,
  colorLabel,
}: Props) {
  const [server, setServer] = useState<null | {
    title: string;
    color: string;
    project_specific_id: number;
  }>(
    computeServer != null
      ? {
          title: computeServer.get("title"),
          color: computeServer.get("color"),
          project_specific_id: computeServer.get("project_specific_id"),
        }
      : null,
  );
  useEffect(() => {
    if (computeServer != null) {
      setServer({
        title: computeServer.get("title"),
        color: computeServer.get("color"),
        project_specific_id: computeServer.get("project_specific_id"),
      });
      return;
    }
    if (!id) {
      setServer({
        title: "Home Base",
        color: PROJECT_COLOR,
        project_specific_id: 0,
      });
      return;
    }
    (async () => {
      try {
        setServer(await getTitle(id));
      } catch (err) {
        console.warn(err);
      }
    })();
  }, [id, computeServer]);

  if (colorOnly) {
    return (
      <div
        style={{
          backgroundColor: server?.color,
          height: "3px",
          textAlign: "center",
          color: server?.color ? avatar_fontcolor(server?.color) : undefined,
          ...style,
        }}
      >
        {colorLabel}
      </div>
    );
  }

  if (prompt) {
    const s = (
      <span style={style}>
        compute-server-{server?.project_specific_id ?? "?"}
      </span>
    );
    if (server == null) {
      return s;
    }
    return (
      <Tooltip title={<>Compute Server '{trunc_middle(server.title, 40)}'</>}>
        {s}
      </Tooltip>
    );
  }

  if (server == null) {
    return (
      <span style={style}>
        <Spin />
      </span>
    );
  }
  let label;
  if (idOnly) {
    label = `Id: ${server.project_specific_id}`;
  } else {
    label = titleOnly ? (
      trunc_middle(server.title, 30)
    ) : (
      <>
        Compute Server '{trunc_middle(server.title, 30)}' (Id:{" "}
        {server.project_specific_id})
      </>
    );
  }
  if (noColor) {
    return <span style={style}>{label}</span>;
  }
  return (
    <span
      style={{
        backgroundColor: server.color,
        color: avatar_fontcolor(server.color),
        overflow: "hidden",
        padding: "0 5px",
        borderRadius: "3px",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

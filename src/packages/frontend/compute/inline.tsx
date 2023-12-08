/*
Simple inline display of the compute server with given id, for use
elsewhere in cocalc.

This may get more sophisticated, e.g., clickable link, hover for status, etc.
*/

import { useEffect, useState } from "react";
import getTitle from "./get-title";
import { Spin, Tooltip } from "antd";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

interface Props {
  id: number;
  noColor?: boolean;
  colorOnly?: boolean;
  style?;
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
  prompt,
  computeServer,
  colorLabel,
}: Props) {
  const [server, setServer] = useState<null | {
    title: string;
    color: string;
  }>(
    computeServer != null
      ? { title: computeServer.get("title"), color: computeServer.get("color") }
      : null,
  );
  useEffect(() => {
    if (computeServer != null) {
      setServer({
        title: computeServer.get("title"),
        color: computeServer.get("color"),
      });
      return;
    }
    if (!id) {
      setServer({ title: "Shared Server", color: "#666" });
      return;
    }
    (async () => {
      try {
        setServer(await getTitle(id));
      } catch (err) {
        console.warn(err);
        setServer({
          title: `Compute Server with Id=${id}`,
          color: "#000",
        });
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
          ...style,
        }}
      >
        {colorLabel}
      </div>
    );
  }

  if (prompt) {
    const s = <span style={style}>compute-server-{id}</span>;
    if (server == null) {
      return s;
    }
    return <Tooltip title={<>Compute Server '{server.title}'</>}>{s}</Tooltip>;
  }

  if (server == null) {
    return (
      <span style={style}>
        <Spin />
      </span>
    );
  }
  const label = titleOnly ? (
    server.title
  ) : (
    <>
      Compute Server '{server.title}' (Id: {id})
    </>
  );
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

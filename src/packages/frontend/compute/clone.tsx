/*
Clone compute server config.  Entirely done client side.

Main issue is DNS can't be the same.

In the future we will ALSO support a checkbox to clone the data too, but not yet.
*/

import { Alert, Modal } from "antd";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import Inline from "./inline";
import { createServer, getServers } from "./api";

export default function Clone({ id, project_id, close }) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <Modal
      open
      confirmLoading={loading}
      onCancel={close}
      onOk={async () => {
        try {
          setLoading(true);
          await createClone({ id, project_id });
          close();
        } catch (err) {
          setError(`${err}`);
        } finally {
          setLoading(false);
        }
      }}
      title={
        <>
          Clone Compute Server <Inline id={id} />
        </>
      }
      okText={
        <>
          Clon{loading ? "ing" : "e"} <Inline id={id} />
        </>
      }
    >
      <ShowError
        error={error}
        setError={setError}
        style={{ marginBottom: "15px" }}
      />
      This makes a new deprovisioned compute server that is configured as close
      as possibleto this this compute server.{" "}
      <Alert
        showIcon
        style={{ margin: "15px" }}
        type="warning"
        message="The underlying disk is not copied."
      />
      After cloning the compute server, you can edit anything about its
      configuration before starting it.
    </Modal>
  );
}

async function createClone({
  id,
  project_id,
}: {
  id: number;
  project_id: string;
}) {
  const servers = await getServers({ project_id });
  const titles = new Set(servers.map((x) => x.title));
  const allDns = new Set(
    servers.filter((x) => x.configuration.dns).map((x) => x.configuration.dns),
  );
  let server;
  let done = false;
  for (const s of servers) {
    if (s.id == id) {
      server = s;
      done = true;
      break;
    }
  }
  if (!done) {
    throw Error(`no such compute server ${id}`);
  }
  let n = 1;
  let title = `Clone of ${server.title}`;
  if (titles.has(title)) {
    while (titles.has(title + ` (${n})`)) {
      n += 1;
    }
    title = title + ` (${n})`;
  }
  server.title = title;

  delete server.configuration.authToken;

  if (server.configuration.dns) {
    n = 1;
    while (allDns.has(server.configuration.dns + `-${n}`)) {
      n += 1;
    }
    server.configuration.dns = server.configuration.dns + `-${n}`;
  }

  await createServer({ ...server });
}

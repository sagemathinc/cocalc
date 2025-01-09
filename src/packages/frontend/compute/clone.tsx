/*
Clone compute server config.  Entirely done client side.

Main issue is DNS can't be the same.

In the future we will ALSO support a checkbox to clone the data too, but not yet.
*/

import { Alert, Modal } from "antd";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import Inline from "./inline";
import { createServer, getServersById } from "./api";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";

export default function Clone({ id, close }) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <Modal
      width={700}
      open
      confirmLoading={loading}
      onCancel={close}
      onOk={async () => {
        try {
          setLoading(true);
          await createClone({ id });
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

export async function cloneConfiguration({
  id,
  noChange,
}: {
  id: number;
  noChange?: boolean;
}) {
  const servers = await getServersById({ ids: [id] });
  if (servers.length == 0) {
    throw Error(`no such compute server ${id}`);
  }
  const server = servers[0] as ComputeServerUserInfo;
  if (!noChange) {
    let n = 1;
    let title = `Clone of ${server.title}`;
    const titles = new Set(servers.map((x) => x.title));
    if (titles.has(title)) {
      while (titles.has(title + ` (${n})`)) {
        n += 1;
      }
      title = title + ` (${n})`;
    }
    server.title = title;
  }

  delete server.configuration.authToken;
  return server;
}

async function createClone({ id }: { id: number }) {
  const server = await cloneConfiguration({ id });
  await createServer({ ...server });
}

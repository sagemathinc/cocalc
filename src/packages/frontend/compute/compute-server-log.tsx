/*
Show the log entries for a specific compute server.

More precisely this is a little button that you click on, and
it shows the log in a modal.
*/

import { Modal, Button, Spin, Table, Tooltip } from "antd";
import { useEffect, useState } from "react";
import LogEntry from "./log-entry";
import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import { TimeAgo } from "@cocalc/frontend/components";
import { getLog } from "./api";
import { Icon } from "@cocalc/frontend/components";
import getTitle from "./get-title";

export default function ComputeServerLog({
  id,
  style,
}: {
  id: number;
  style?;
  color?: string;
}) {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <Tooltip title={"Show configuration and control log"}>
      <Button
        size={"small"}
        type="text"
        style={{ color: "#666", ...style }}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Icon name="history" /> Log
      </Button>
      {open && <LogModal id={id} close={() => setOpen(false)} />}
    </Tooltip>
  );
}

export function LogModal({ id, close }) {
  const [log, setLog] = useState<
    null | { time: Date; project_id: string; event: ComputeServerEvent }[]
  >(null);
  const [title, setTitle] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLog(await getLog({ id }));
      setTitle((await getTitle(id)).title);
    })();
  }, []);

  return (
    <Modal
      width={800}
      title={
        <>
          <Icon name="server" /> Compute Server Log - "{title}"
        </>
      }
      open
      onCancel={close}
      onOk={close}
    >
      {log == null && <Spin />}
      {log != null && (
        <Table dataSource={log} rowKey={(record) => record.time.toString()}>
          <Table.Column
            title="Log Entry"
            render={(record) => (
              <LogEntry
                event={record.event}
                hideTitle
                project_id={record.project_id}
              />
            )}
          />
          <Table.Column
            title="Time"
            render={(record) => <TimeAgo date={record.time} />}
          />
        </Table>
      )}
    </Modal>
  );
}

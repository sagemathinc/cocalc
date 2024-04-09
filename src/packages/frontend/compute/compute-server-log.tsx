/*
Show the log entries for a specific compute server.

More precisely this is a little button that you click on, and
it shows the log in a modal.
*/

import { Modal, Button, Spin, Table } from "antd";
import { useState } from "react";
import LogEntry from "./log-entry";
import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import { TimeAgo } from "@cocalc/frontend/components";
import { getLog } from "./api";
import { Icon } from "@cocalc/frontend/components";

export default function ComputeServerLog({
  id,
  style,
  title = "",
}: {
  id: number;
  style?;
  title?: string;
  color?: string;
}) {
  const [show, setShow] = useState<boolean>(false);
  const [log, setLog] = useState<
    null | { time: Date; project_id: string; event: ComputeServerEvent }[]
  >(null);

  return (
    <>
      <Button
        size={"small"}
        type="text"
        style={{ color: "#666", ...style }}
        onClick={async () => {
          setShow(!show);
          if (!show) {
            // showing log, so update it:
            setLog(await getLog({ id }));
          }
        }}
      >
        <Icon name="history" /> Log
      </Button>
      <Modal
        width={800}
        title={
          <>
            <Icon name="server" /> Compute Server Log - "{title}"
          </>
        }
        open={show}
        onCancel={() => {
          setShow(false);
        }}
        onOk={() => {
          setShow(false);
        }}
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
    </>
  );
}

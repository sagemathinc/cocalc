/*
Show the log entries for a specific compute server.

More precisely this is a little button that you click on, and
it shows the log in a modal.
*/

import {
  Modal,
  Button,
  Checkbox,
  Flex,
  Radio,
  Spin,
  Table,
  Tooltip,
} from "antd";
import { useEffect, useState } from "react";
import LogEntry from "./log-entry";
import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import { TimeAgo } from "@cocalc/frontend/components";
import { getLog } from "./api";
import { Icon } from "@cocalc/frontend/components";
import getTitle from "./get-title";
import { getPurchases } from "@cocalc/frontend/purchases/api";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import ShowError from "@cocalc/frontend/components/error";
import {
  DetailedPurchaseTable,
  GroupedPurchaseTable,
} from "@cocalc/frontend/purchases/purchases";
import { currency } from "@cocalc/util/misc";
import { toDecimal } from "@cocalc/util/money";

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

const OPTIONS = [
  //{ label: "Files", value: "files" },
  { label: "Activity", value: "activity" },
  { label: "Purchases", value: "purchases" },
];

const LIMIT = 500;

export function LogModal({ id, close }) {
  const [log, setLog] = useState<
    | null
    | any[]
    | { time: Date; project_id: string; event: ComputeServerEvent }[]
    | Purchase[]
  >(null);
  const [title, setTitle] = useState<string>("");
  const [type, setType] = useState<string>("activity");
  const [error, setError] = useState<string>("");
  const [total, setTotal] = useState<number | null>(null);
  const [group, setGroup] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      setTitle((await getTitle(id)).title);
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        if (type == "files" || type == "activity") {
          setLog(await getLog({ id, type }));
        } else if (type == "purchases") {
          const { purchases } = await getPurchases({
            compute_server_id: id,
            limit: LIMIT,
            group,
          });
          setLog(purchases);
          let totalValue = toDecimal(0);
          for (const { cost, cost_so_far } of purchases) {
            totalValue = totalValue.add(cost ?? cost_so_far ?? 0);
          }
          setTotal(totalValue.toNumber());
        }
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [type, id, group]);

  return (
    <Modal
      width={1100}
      title={
        <>
          <Icon name="server" /> Compute Server Log - "{title}"
        </>
      }
      open
      onCancel={close}
      onOk={close}
    >
      <Flex style={{ marginBottom: "15px" }}>
        <Radio.Group
          options={OPTIONS}
          onChange={({ target: { value } }) => {
            setLog(null);
            setTotal(null);
            setType(value);
          }}
          value={type}
          optionType="button"
        />
        <div style={{ flex: 1 }} />
        {type == "purchases" && (
          <Checkbox
            style={{ alignItems: "center" }}
            checked={group}
            onChange={(e) => {
              setGroup(e.target.checked);
              setLog(null);
              setTotal(null);
            }}
          >
            Group by Service
          </Checkbox>
        )}
        <div style={{ flex: 1 }} />
        {total != null && log != null && (
          <div>
            <b>
              Total{" "}
              {log.length <= LIMIT ? "Spend on Server" : "of Displayed Spend"}:{" "}
              {currency(total)}
            </b>
          </div>
        )}
      </Flex>
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0" }}
      />
      {log == null && (
        <div style={{ textAlign: "center", margin: "15px" }}>
          <Spin />
        </div>
      )}
      {log != null && type == "purchases" && !group && (
        <DetailedPurchaseTable
          purchases={log}
          hideColumns={new Set(["project"])}
          style={{ maxHeight: "70vh", overflow: "auto" }}
        />
      )}
      {log != null && type == "purchases" && group && (
        <GroupedPurchaseTable
          purchases={log}
          hideColumns={new Set(["project"])}
          style={{ maxHeight: "70vh", overflow: "auto" }}
        />
      )}
      {log != null && type == "activity" && (
        <Table
          dataSource={log}
          rowKey={(record) => record.id}
          pagination={false}
          style={{ maxHeight: "70vh", overflow: "auto" }}
        >
          <Table.Column
            title={"Log Entry"}
            render={(record) => {
              return (
                <LogEntry
                  event={record.event}
                  hideTitle
                  project_id={record.project_id}
                />
              );
            }}
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

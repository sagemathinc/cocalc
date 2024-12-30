import { ACTION_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Button, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import { getUnitId } from "./util";
import type { Unit } from "../store";
import { getServersById } from "@cocalc/frontend/compute/api";

interface Props {
  actions: CourseActions;
  unit: Unit;
}

type ServersMap = {
  [id: number]: { id?: number; state?; deleted?: boolean };
};

export default function Students({ actions, unit }: Props) {
  const [servers, setServers] = useState<ServersMap | null>(null);
  const students = useRedux(actions.name, "students");
  const [error, setError] = useState<string>("");

  console.log({ servers });

  useEffect(() => {
    if (error) {
      return;
    }
    (async () => {
      const students = unit
        .getIn(["compute_server", "students"]) // @ts-ignore
        ?.valueSeq()
        .toJS();
      if (students == null) {
        return [];
      }
      try {
        const serverArray = await getServersById({
          ids: students.map(({ server_id }) => server_id).filter((id) => !!id),
          fields: ["id", "state", "deleted"],
        });
        const servers: ServersMap = {};
        for (const server of serverArray) {
          servers[server.id!] = server;
        }
        setServers(servers);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [unit, error]);

  const v: JSX.Element[] = [];
  for (const [_, student] of students) {
    if (student.get("deleted")) {
      continue;
    }
    v.push(
      <StudentControl
        key={student.get("student_id")}
        student={student}
        actions={actions}
        unit={unit}
        servers={servers}
      />,
    );
  }

  return (
    <Space direction="vertical">
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
      {v}
    </Space>
  );
}

const ACTIONS = [
  "create",
  "start",
  "stop",
  "deprovision",
  "transfer",
  "delete",
] as const;

type Action = (typeof ACTIONS)[number];

const VALID_ACTIONS: { [state: string]: Action[] } = {
  off: ["start", "deprovision", "transfer", "delete"],
  starting: [],
  running: ["stop"],
  stopping: [],
  deprovisioned: ["start", "transfer", "delete"],
  suspending: [],
  suspended: ["start"],
};

function StudentControl({ student, actions, unit, servers }) {
  const [loading, setLoading] = useState<null | Action>(null);
  const [error, setError] = useState<string>("");
  const student_id = student.get("student_id");
  const server_id = unit.getIn([
    "compute_server",
    "students",
    student_id,
    "server_id",
  ]);
  const server = servers?.[server_id];
  const name = actions.get_store().get_student_name(student.get("student_id"));
  const v = [
    <div
      key="name"
      style={{
        width: "150px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </div>,
  ];
  v.push(
    <div key="state" style={{ width: "100px" }}>
      {capitalize(server?.state ?? "-")}
    </div>,
  );
  for (const action of ACTIONS) {
    if (action == "create") {
      if (server_id) {
        // already created
        continue;
      }
    } else {
      if (!server_id) {
        // doesn't exist, so no need for these buttons
        continue;
      }
    }
    if (server?.state != null) {
      if (!VALID_ACTIONS[server.state]?.includes(action)) {
        continue;
      }
    }
    let disabled = loading == action;
    if (!disabled) {
      // disable some buttons depending on state info...
      if (server_id) {
        if (action == "create") {
          disabled = true;
        } else {
        }
      } else {
        if (action != "create") {
          disabled = true;
        }
      }
    }
    let icon = ACTION_INFO[action]?.icon;
    if (action == "delete") {
      icon = "trash";
    } else if (action == "transfer") {
      icon = "user-check";
    }
    v.push(
      <Button
        disabled={disabled}
        onClick={async () => {
          try {
            setLoading(action);
            const unit_id = getUnitId(unit);
            await actions.compute.createComputeServer({ student_id, unit_id });
          } catch (err) {
            setError(`${err}`);
          } finally {
            setLoading(null);
          }
        }}
        key={action}
      >
        {icon != null ? <Icon name={icon as any} /> : undefined}{" "}
        {capitalize(action)}
        {loading == action && <Spin style={{ marginLeft: "15px" }} />}
      </Button>,
    );
  }
  return (
    <>
      <Space>{v}</Space>{" "}
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
    </>
  );
}

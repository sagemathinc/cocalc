import {
  ACTION_INFO,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import { Button, Checkbox, Popconfirm, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, get_array_range } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import type { Unit } from "../store";
import { getServersById } from "@cocalc/frontend/compute/api";
import { BigSpin } from "@cocalc/frontend/purchases/stripe-payment";
import { getUnitId } from "./util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

interface Props {
  actions: CourseActions;
  unit: Unit;
}

type ServersMap = {
  [id: number]: { id?: number; state?; deleted?: boolean };
};

const getStudentServers = reuseInFlight(
  async (unit: Unit) => {
    const students = unit
      .getIn(["compute_server", "students"]) // @ts-ignore
      ?.valueSeq()
      .toJS();
    if (students == null) {
      return {};
    }
    const ids = students
      .map(({ server_id }) => server_id)
      .filter((id) => !!id && typeof id == "number"); // typeof is just to make this robust against .course file being messed up...
    const serverArray = await getServersById({
      ids,
      fields: ["id", "state", "deleted"],
    });
    const servers: ServersMap = {};
    for (const server of serverArray) {
      servers[server.id!] = server;
    }
    return servers;
  },
  { createKey: (args) => getUnitId(args[0]) },
);

export default function Students({ actions, unit }: Props) {
  const [servers, setServers] = useState<ServersMap | null>(null);
  const students = useRedux(actions.name, "students");
  const [error, setError] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mostRecentSelected, setMostRecentSelected] = useState<string | null>(
    null,
  );
  const updateServers = async () => {
    try {
      setServers(await getStudentServers(unit));
      setError("");
    } catch (err) {
      setError(`${err}`);
    }
  };

  useEffect(() => {
    if (error) {
      return;
    }
    updateServers();
  }, [unit, error]);

  if (servers == null) {
    if (error) {
      return <ShowError error={error} setError={setError} />;
    }
    return <BigSpin />;
  }

  const nonDeletedStudents = students.filter(
    (student) => !student.get("deleted"),
  );

  const v: JSX.Element[] = [];
  v.push(
    <div key="all">
      <div
        key="check-all"
        style={{
          width: "30px",
          marginLeft: "14px",
          fontSize: "14pt",
          cursor: "pointer",
        }}
        onClick={() => {
          const ids = nonDeletedStudents
            .valueSeq()
            .toJS()
            .map(({ student_id }) => student_id);
          if (selected.size == 0) {
            setSelected(new Set(ids));
          } else {
            setSelected(new Set());
          }
        }}
      >
        <Icon
          style={{ marginRight: "30px" }}
          name={
            selected.size == 0
              ? "square"
              : selected.size == nonDeletedStudents.size
                ? "check-square"
                : "minus-square"
          }
        />
      </div>
    </div>,
  );
  let i = 0;
  for (const [_, student] of nonDeletedStudents) {
    if (student.get("deleted")) {
      continue;
    }
    const student_id = student.get("student_id");
    v.push(
      <StudentControl
        key={student_id}
        student={student}
        actions={actions}
        unit={unit}
        servers={servers}
        updateServers={updateServers}
        style={i % 2 ? { background: "#f2f6fc" } : undefined}
        selected={selected.has(student_id)}
        setSelected={(checked, shift) => {
          if (!shift || !mostRecentSelected) {
            if (checked) {
              selected.add(student_id);
            } else {
              selected.delete(student_id);
            }
          } else {
            // set the range of id's between this message and the most recent one
            // to be checked.  See also similar code in messages and our explorer,
            // e.g., frontend/messages/main.tsx
            const v = get_array_range(
              students
                .valueSeq()
                .toJS()
                .map(({ student_id }) => student_id),
              mostRecentSelected,
              student_id,
            );
            if (checked) {
              for (const student_id of v) {
                selected.add(student_id);
              }
            } else {
              for (const student_id of v) {
                selected.delete(student_id);
              }
            }
          }
          setSelected(new Set(selected));
          setMostRecentSelected(student_id);
        }}
      />,
    );
    i += 1;
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
      {v}
    </Space>
  );
}

const COMMANDS = [
  "create",
  "start",
  "stop",
  "deprovision",
  "delete",
  "transfer",
] as const;

export type Command = (typeof COMMANDS)[number];

const VALID_COMMANDS: { [state: string]: Command[] } = {
  off: ["start", "deprovision", "transfer", "delete"],
  starting: [],
  running: ["stop"],
  stopping: [],
  deprovisioned: ["start", "transfer", "delete"],
  suspending: [],
  suspended: ["start"],
};

function StudentControl({
  student,
  actions,
  unit,
  servers,
  updateServers,
  style,
  selected,
  setSelected,
}) {
  const [loading, setLoading] = useState<null | Command>(null);
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

  const v: JSX.Element[] = [];

  v.push(
    <Checkbox
      key="checkbox"
      style={{ width: "30px" }}
      checked={selected}
      onChange={(e) => {
        const shiftKey = e.nativeEvent.shiftKey;
        setSelected(e.target.checked, shiftKey);
      }}
    />,
  );

  v.push(
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
  );
  if (server?.state) {
    v.push(
      <div key="state" style={{ width: "125px" }}>
        <Icon name={STATE_INFO[server.state].icon as any} />{" "}
        {capitalize(server.state)}
      </div>,
    );
  } else {
    v.push(
      <div key="state" style={{ width: "125px" }}>
        -
      </div>,
    );
  }
  const getButton = ({ command, disabled, icon }) => {
    const confirm = command == "delete" || command == "deprovision";
    const doIt = async () => {
      try {
        setLoading(command);
        await actions.compute.computeServerCommand({
          command,
          unit,
          student_id,
        });
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(null);
        updateServers();
      }
    };
    const btn = (
      <Button
        disabled={disabled}
        onClick={confirm ? undefined : doIt}
        key={command}
      >
        {icon != null ? <Icon name={icon as any} /> : undefined}{" "}
        {capitalize(command)}
        {loading == command && <Spin style={{ marginLeft: "15px" }} />}
      </Button>
    );
    if (confirm) {
      return (
        <Popconfirm
          key={command}
          onConfirm={doIt}
          title={`${capitalize(command)} this compute server?`}
        >
          {btn}
        </Popconfirm>
      );
    } else {
      return btn;
    }
  };
  for (const command of COMMANDS) {
    if (command == "create") {
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
      if (!VALID_COMMANDS[server.state]?.includes(command)) {
        continue;
      }
    }
    let disabled = loading == command;
    if (!disabled) {
      // disable some buttons depending on state info...
      if (server_id) {
        if (command == "create") {
          disabled = true;
        } else {
        }
      } else {
        if (command != "create") {
          disabled = true;
        }
      }
    }
    let icon = ACTION_INFO[command]?.icon;
    if (command == "delete") {
      icon = "trash";
    } else if (command == "transfer") {
      icon = "user-check";
    }
    v.push(getButton({ command, icon, disabled }));
  }
  return (
    <div
      style={{
        borderRadius: "5px",
        padding: "5px 15px",
        ...style,
      }}
    >
      <Space wrap style={{ width: "100%" }}>
        {v}
      </Space>
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
    </div>
  );
}

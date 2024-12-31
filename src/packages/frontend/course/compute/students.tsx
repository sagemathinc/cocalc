import {
  ACTION_INFO,
  STATE_INFO,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Alert, Button, Checkbox, Popconfirm, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, get_array_range, plural } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import type { Unit } from "../store";
import { getServersById } from "@cocalc/frontend/compute/api";
import { BigSpin } from "@cocalc/frontend/purchases/stripe-payment";
import { getUnitId } from "./util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { TerminalButton, TerminalCommand } from "./terminal-command";
import ComputeServer from "@cocalc/frontend/compute/inline";
import type { StudentsMap } from "../store";

declare var DEBUG: boolean;

interface Props {
  actions: CourseActions;
  unit: Unit;
}

export type ServersMap = {
  [id: number]: {
    id?: number;
    state?;
    deleted?: boolean;
    configuration?: Configuration;
  };
};

const getStudentServers = reuseInFlight(
  async (unit: Unit): Promise<ServersMap> => {
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

    // also get the instructor's compute server
    const instructor_server_id = unit.getIn(["compute_server", "server_id"]);
    if (instructor_server_id) {
      ids.push(instructor_server_id);
    }

    const serverArray = await getServersById({
      ids,
      fields: ["id", "state", "deleted", "configuration"],
    });

    const servers: ServersMap = {};
    for (const server of serverArray) {
      servers[server.id!] = server;
    }
    return servers;
  },
  { createKey: (args) => getUnitId(args[0]) },
);

export type SelectedStudents = Set<string>;

export default function Students({ actions, unit }: Props) {
  const [servers, setServers] = useState<ServersMap | null>(null);
  const students: StudentsMap = useRedux(actions.name, "students");
  const [error, setError] = useState<string>("");
  const [selected, setSelected] = useState<SelectedStudents>(new Set());
  const [terminal, setTerminal] = useState<boolean>(false);
  const [mostRecentSelected, setMostRecentSelected] = useState<string | null>(
    null,
  );
  const instructor_server_id = unit.getIn(["compute_server", "server_id"]);
  const updateServers = async () => {
    const store = actions.get_store();
    // get latest version since it might not have updated just yet.
    const unit1 =
      store?.getUnit((unit.get("assignment_id") ?? unit.get("handout_id"))!) ??
      unit;
    try {
      setServers(await getStudentServers(unit1));
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

  let extra: JSX.Element | null = null;

  if (
    instructor_server_id &&
    servers[instructor_server_id]?.configuration?.cloud == "onprem"
  ) {
    extra = (
      <Alert
        style={{ margin: "15px 0" }}
        type="warning"
        showIcon
        message={"Self Hosted Compute Server"}
        description={
          <>
            Self hosted compute servers are currently not supported for courses.
            The compute server <ComputeServer id={instructor_server_id} /> is
            self hosted. Please select a non-self-hosted compute server instead.
            {DEBUG ? (
              <b> You are in DEBUG mode, so we still allow this.</b>
            ) : (
              ""
            )}
          </>
        }
      />
    );
    if (!DEBUG) {
      return extra;
    }
  }

  const nonDeletedStudents = students.filter(
    (student) => !student.get("deleted"),
  );
  const studentIds = nonDeletedStudents
    .valueSeq()
    .toJS() // @ts-ignore
    .map(({ student_id }) => student_id);

  const v: JSX.Element[] = [];
  v.push(
    <div
      key="all"
      style={{
        height: terminal ? undefined : "32px" /* this avoids a flicker */,
      }}
    >
      <Space>
        <div
          key="check-all"
          style={{
            width: "30px",
            marginLeft: "14px",
            fontSize: "14pt",
            cursor: "pointer",
          }}
          onClick={() => {
            if (selected.size == 0) {
              setSelected(new Set(studentIds));
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
        {selected.size > 0 && servers != null && (
          <CommandsOnSelected
            key="commands-on-selected"
            {...{
              selected,
              servers,
              actions,
              unit,
              setError,
              updateServers,
              terminal,
              setTerminal,
            }}
          />
        )}
      </Space>
      {terminal && (
        <TerminalCommand
          style={{ marginTop: "15px" }}
          servers={servers}
          selected={selected}
          students={students}
          unit={unit}
        />
      )}
    </div>,
  );
  let i = 0;
  for (const student_id of studentIds) {
    v.push(
      <StudentControl
        key={student_id}
        student={students.get(student_id)}
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
              studentIds,
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
      {extra}
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
  const server_id = getServerId({ unit, student_id });
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
  const getButton = ({ command, disabled }) => {
    return (
      <CommandButton
        key={command}
        {...{
          command,
          disabled,
          loading,
          setLoading,
          actions,
          unit,
          student_id,
          setError,
          updateServers,
          servers,
        }}
      />
    );
  };

  for (const command of getCommands(server)) {
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
    v.push(getButton({ command, disabled }));
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

function CommandButton({
  command,
  disabled,
  loading,
  setLoading,
  actions,
  unit,
  student_id,
  setError,
  updateServers,
  servers,
}) {
  const confirm = command == "delete" || command == "deprovision";
  const studentIds =
    typeof student_id == "string" ? [student_id] : Array.from(student_id);
  const doIt = async () => {
    try {
      setLoading(command);
      await Promise.all(
        studentIds.map(async (student_id) => {
          const server_id = getServerId({ unit, student_id });
          if (!getCommands(servers[server_id]).includes(command)) {
            return;
          }
          await actions.compute.computeServerCommand({
            command,
            unit,
            student_id,
          });
        }),
      );
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(null);
      updateServers();
    }
  };
  const icon = getIcon(command);
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
        title={`${capitalize(command)} ${studentIds.length == 1 ? "this compute server" : "these compute servers"}?`}
      >
        {btn}
      </Popconfirm>
    );
  } else {
    return btn;
  }
}

function getCommands(server): Command[] {
  const v: Command[] = [];
  for (const command of COMMANDS) {
    if (command == "transfer") {
      // this is a can of worms to implement (see packages/server/compute/transfer-ownership.ts),
      // so we will wait until later.
      continue;
    }
    if (command == "create") {
      if (server != null) {
        // already created
        continue;
      }
    } else {
      if (server == null) {
        // doesn't exist, so no need for other buttons
        continue;
      }
    }
    if (server?.state != null) {
      if (!VALID_COMMANDS[server.state]?.includes(command)) {
        continue;
      }
    }

    v.push(command);
  }
  return v;
}

function getIcon(command: Command) {
  if (command == "delete") {
    return "trash";
  } else if (command == "transfer") {
    return "user-check";
  } else if (command == "create") {
    return "plus-circle";
  } else {
    return ACTION_INFO[command]?.icon;
  }
}

export function getServerId({ unit, student_id }) {
  return unit.getIn(["compute_server", "students", student_id, "server_id"]);
}

function CommandsOnSelected({
  selected,
  servers,
  actions,
  unit,
  setError,
  updateServers,
  terminal,
  setTerminal,
}) {
  const [loading, setLoading] = useState<null | Command>(null);

  if (selected.size == 0) {
    return null;
  }

  const X = new Set<string>();
  for (const student_id of selected) {
    const server_id = getServerId({ unit, student_id });
    for (const command of getCommands(servers[server_id])) {
      X.add(command);
    }
  }

  const v: JSX.Element[] = [];
  for (const command of X) {
    v.push(
      <CommandButton
        key={command}
        {...{
          command,
          disabled: loading,
          loading,
          setLoading,
          actions,
          unit,
          student_id: selected,
          setError,
          updateServers,
          servers,
        }}
      />,
    );
  }
  if (X.has("stop")) {
    v.push(<TerminalButton terminal={terminal} setTerminal={setTerminal} />);
  } else if (terminal) {
    setTimeout(() => {
      setTerminal(false);
    }, 0);
  }
  v.push(
    <div key="what">
      {selected.size} selected {plural(selected.size, "server")}
    </div>,
  );

  return (
    <>
      <Space wrap>{v}</Space>
    </>
  );
}

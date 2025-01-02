import {
  ACTION_INFO,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import { Alert, Button, Checkbox, Popconfirm, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, get_array_range, plural } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import type { Unit } from "../store";
import { getServersById } from "@cocalc/frontend/compute/api";
import { BigSpin } from "@cocalc/frontend/purchases/stripe-payment";
import { MAX_PARALLEL_TASKS } from "./util";
import { TerminalButton, TerminalCommand } from "./terminal-command";
import ComputeServer from "@cocalc/frontend/compute/inline";
import type { StudentsMap } from "../store";
import { map as awaitMap } from "awaiting";
import type { SyncTable } from "@cocalc/sync/table";
import { getSyncTable } from "./synctable";

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
  };
};

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
  const course_server_id = unit.getIn(["compute_server", "server_id"]);
  const [courseServer, setCourseServer] = useState<any>(null);
  useEffect(() => {
    if (!course_server_id) {
      setCourseServer(null);
    }
    (async () => {
      const v = await getServersById({
        ids: [course_server_id!],
        fields: ["configuration"],
      });
      setCourseServer(v[0] ?? null);
    })();
  }, [course_server_id]);

  const studentServersRef = useRef<null | SyncTable>(null);
  useEffect(() => {
    const course_project_id = actions.get_store().get("course_project_id");
    if (!course_server_id || !course_project_id) {
      studentServersRef.current = null;
      return;
    }
    (async () => {
      studentServersRef.current = await getSyncTable({
        course_server_id,
        course_project_id,
        fields: ["state", "deleted"],
      });
      studentServersRef.current.on("change", () => {
        setServers(studentServersRef.current?.get()?.toJS() ?? null);
      });
    })();

    return () => {
      const table = studentServersRef.current;
      if (table != null) {
        studentServersRef.current = null;
        table.close();
      }
    };
  }, [course_server_id]);

  if (servers == null) {
    if (error) {
      return <ShowError error={error} setError={setError} />;
    }
    return <BigSpin />;
  }

  let extra: JSX.Element | null = null;

  if (!!course_server_id && courseServer?.configuration?.cloud == "onprem") {
    extra = (
      <Alert
        style={{ margin: "15px 0" }}
        type="warning"
        showIcon
        message={"Self Hosted Compute Server"}
        description={
          <>
            Self hosted compute servers are currently not supported for courses.
            The compute server <ComputeServer id={course_server_id} /> is self
            hosted. Please select a non-self-hosted compute server instead.
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
          <Button>
            <Icon
              name={
                selected.size == 0
                  ? "square"
                  : selected.size == nonDeletedStudents.size
                    ? "check-square"
                    : "minus-square"
              }
            />
            {selected.size == 0 ? "Check All" : "Uncheck All"}
          </Button>
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
              terminal,
              setTerminal,
            }}
          />
        )}
      </Space>
      {terminal && (
        <TerminalCommand
          onClose={() => setTerminal(false)}
          style={{ marginTop: "15px" }}
          {...{ servers, selected, students, unit, actions }}
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
  "reboot",
  "deprovision",
  "delete",
  "transfer",
] as const;

export type Command = (typeof COMMANDS)[number];

const REQUIRES_CONFIRM = new Set(["stop", "deprovision", "reboot", "delete"]);

const VALID_COMMANDS: { [state: string]: Command[] } = {
  off: ["start", "deprovision", "transfer", "delete"],
  starting: [],
  running: ["stop", "reboot"],
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
  servers,
}) {
  const confirm = REQUIRES_CONFIRM.has(command);
  const studentIds =
    typeof student_id == "string" ? [student_id] : Array.from(student_id);
  const doIt = async () => {
    try {
      setLoading(command);
      const task = async (student_id) => {
        const server_id = getServerId({ unit, student_id });
        if (!getCommands(servers[server_id]).includes(command)) {
          return;
        }
        await actions.compute.computeServerCommand({
          command,
          unit,
          student_id,
        });
      };
      await awaitMap(studentIds, MAX_PARALLEL_TASKS, task);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(null);
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
          servers,
        }}
      />,
    );
  }
  if (X.has("stop")) {
    v.push(
      <TerminalButton
        key="terminal"
        terminal={terminal}
        setTerminal={setTerminal}
      />,
    );
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

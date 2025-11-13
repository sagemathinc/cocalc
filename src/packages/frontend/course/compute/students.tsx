import {
  ACTION_INFO,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import {
  Alert,
  Button,
  Checkbox,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CourseActions } from "../actions";
import { redux, useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, get_array_range, plural } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import type { Unit } from "../store";
import { getServersById } from "@cocalc/frontend/compute/api";
import { BigSpin } from "@cocalc/frontend/purchases/stripe-payment";
import { MAX_PARALLEL_TASKS } from "./util";
import { TerminalButton, TerminalCommand } from "./terminal-command";
import ComputeServer from "@cocalc/frontend/compute/inline";
import CurrentCost from "@cocalc/frontend/compute/current-cost";
import type { StudentsMap } from "../store";
import { map as awaitMap } from "awaiting";
import type { SyncTable } from "@cocalc/sync/table";
import { getSyncTable } from "./synctable";
import { parse_students, pick_student_sorter } from "../util";
import { RunningProgress } from "@cocalc/frontend/compute/doc-status";
import {
  SpendLimitButton,
  SpendLimitStatus,
} from "@cocalc/frontend/compute/spend-limit";
import { webapp_client } from "@cocalc/frontend/webapp-client";

declare var DEBUG: boolean;

interface Props {
  actions: CourseActions;
  unit: Unit;
  onClose?: () => void;
}

export type ServersMap = {
  [id: number]: {
    id?: number;
    state?;
    deleted?: boolean;
  };
};

export type SelectedStudents = Set<string>;

export default function Students({ actions, unit, onClose }: Props) {
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
        fields: [
          "id",
          "state",
          "deleted",
          "cost_per_hour",
          "detailed_state",
          "account_id",
          "project_id",
          "project_specific_id",
          "configuration",
          "spend",
        ],
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

  const active_student_sort = useRedux(actions.name, "active_student_sort");
  const user_map = useTypedRedux("users", "user_map");
  const studentIds = useMemo(() => {
    const v0 = parse_students(students, user_map, redux);
    // Remove deleted students
    const v1: any[] = [];
    for (const x of v0) {
      if (!x.deleted) {
        v1.push(x);
      }
    }
    v1.sort(pick_student_sorter(active_student_sort.toJS()));
    return v1.map((x) => x.student_id) as string[];
  }, [students, user_map, active_student_sort]);

  if (servers == null) {
    if (error) {
      return <ShowError error={error} setError={setError} />;
    }
    return <BigSpin />;
  }

  let extra: React.JSX.Element | null = null;

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

  const v: React.JSX.Element[] = [];
  v.push(
    <div
      key="all"
      style={{
        minHeight: "32px" /* this avoids a flicker */,
        borderBottom: "1px solid #ccc",
        paddingBottom: "15px",
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
                  : selected.size == studentIds.length
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
        onClose={onClose}
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

const REQUIRES_CONFIRM = new Set([
  "stop",
  "deprovision",
  "reboot",
  "delete",
  "transfer",
]);

const VALID_COMMANDS: { [state: string]: Command[] } = {
  off: ["start", "deprovision", "delete"],
  starting: [],
  running: ["stop", "reboot", "deprovision"],
  stopping: [],
  deprovisioned: ["start", "transfer", "delete"],
  suspending: [],
  suspended: ["start", "deprovision"],
};

const NONOWNER_COMMANDS = new Set(["start", "stop", "reboot"]);

function StudentControl({
  onClose,
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

  const v: React.JSX.Element[] = [];

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
    <a
      key="name"
      onClick={() => {
        const project_id = student.get("project_id");
        if (project_id) {
          redux.getActions("projects").open_project({
            project_id,
          });
          redux.getProjectActions(project_id).showComputeServers();
          onClose?.();
        }
      }}
    >
      <div
        style={{
          width: "150px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </div>
      {student.get("account_id") == server?.account_id ? (
        <div style={{ marginRight: "15px" }}>
          <b>Student Owned Server</b>
        </div>
      ) : undefined}
    </a>,
  );
  if (server?.project_specific_id) {
    v.push(
      <div key="id" style={{ width: "50px" }}>
        <Tooltip
          title={`Compute server has id ${server.project_specific_id} in the student's project, and global id ${server.id}.`}
        >
          Id: {server.project_specific_id}
        </Tooltip>
      </div>,
    );
  }
  if (server?.state) {
    v.push(
      <div key="state" style={{ width: "125px" }}>
        <Icon name={STATE_INFO[server.state].icon as any} />{" "}
        {capitalize(server.state)}
      </div>,
    );
    if (server.state == "running") {
      v.push(
        <div
          key="running-progress"
          style={{ width: "100px", paddingTop: "5px" }}
        >
          <RunningProgress server={server} />
        </div>,
      );
    }
  } else {
    v.push(
      <div key="state" style={{ width: "125px" }}>
        -
      </div>,
    );
  }
  if (server?.cost_per_hour) {
    v.push(
      <div key="cost" style={{ width: "75px" }}>
        <CurrentCost
          state={server.state}
          cost_per_hour={server.cost_per_hour}
        />
      </div>,
    );
  }
  if (server?.id) {
    v.push(
      <div key="cost" style={{ width: "75px" }}>
        <SpendLimitStatus server={server} />
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
    if (server != null && server?.account_id != webapp_client.account_id) {
      // not the owner
      if (!NONOWNER_COMMANDS.has(command)) {
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

  const v: React.JSX.Element[] = [];
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
    <MultiSpendLimitButton selected={selected} servers={servers} unit={unit} />,
  );

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

function MultiSpendLimitButton({ selected, servers, unit }) {
  const extra = useMemo(() => {
    const extra: { project_id: string; id: number }[] = [];
    for (const student_id of selected) {
      const id = getServerId({ unit, student_id });
      if (servers?.[id] != null) {
        const { project_id } = servers[id];
        extra.push({ id, project_id });
      }
    }
    return extra;
  }, [selected]);
  if (extra.length == 0) {
    return null;
  }
  return (
    <SpendLimitButton
      id={extra[0].id}
      project_id={extra[0].project_id}
      extra={extra.slice(1)}
    />
  );
}

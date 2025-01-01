import { Button, Card, Input, InputNumber, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { type CSSProperties, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { plural } from "@cocalc/util/misc";
import { getServerId } from "./students";
import type { SelectedStudents, ServersMap } from "./students";
import type { Unit } from "../store";
import type { CourseActions } from "../actions";
import { RenderOutput } from "../configuration/terminal-command";

export function TerminalButton({ terminal, setTerminal }) {
  return (
    <>
      <Button onClick={() => setTerminal(!terminal)}>
        <Icon name="terminal" /> Terminal
      </Button>
    </>
  );
}

export function TerminalCommand({
  style,
  servers,
  selected,
  unit,
  actions,
}: {
  style?: CSSProperties;
  servers: ServersMap;
  selected: SelectedStudents;
  unit: Unit;
  actions: CourseActions;
}) {
  const [timeout, setTimeout] = useState<number | null>(30);
  const [command, setCommand] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [outputs, setOutputs] = useState<
    {
      stdout?: string;
      stderr?: string;
      exit_code?: number;
      student_id: string;
      total_time: number;
    }[]
  >([]);

  const runningStudentIds: string[] = Array.from(selected).filter(
    (student_id) =>
      servers[getServerId({ unit, student_id })]?.state == "running",
  );

  const runTerminalCommand = async () => {
    try {
      setRunning(true);
      setOutputs([]);
      await actions.compute.runTerminalCommand({
        setOutputs,
        unit,
        student_ids: runningStudentIds,
        command,
        timeout: timeout ?? 30,
        err_on_exit: false,
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title={
        <>
          <Icon name="terminal" style={{ marginRight: "5px" }} /> Run Terminal
          Command on the {runningStudentIds.length} Running Student Compute{" "}
          {plural(runningStudentIds.length, "Server")}
        </>
      }
      style={style}
    >
      <Space.Compact
        style={{
          display: "flex",
          whiteSpace: "nowrap",
          marginBottom: "15px",
        }}
      >
        <Input
          disabled={running}
          style={{ fontFamily: "monospace" }}
          placeholder={"Terminal command to run on compute servers..."}
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
          }}
          onPressEnter={() => {
            runTerminalCommand();
          }}
        />
        <Button
          style={{ width: "6em" }}
          onClick={runTerminalCommand}
          disabled={running || runningStudentIds.length == 0}
        >
          <Icon
            name={running ? "cocalc-ring" : "play"}
            spin={running}
            style={{ marginRight: "5px" }}
          />{" "}
          Run
        </Button>
      </Space.Compact>
      <InputNumber
        disabled={running}
        style={{ maxWidth: "300px" }}
        value={timeout}
        onChange={(t) => setTimeout(t ?? null)}
        min={15}
        max={60 * 60}
        addonAfter={"seconds timeout"}
      />
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
      {outputs.map((output) => {
        return (
          <RenderOutput
            key={output.student_id}
            title={
              actions.get_store()?.get_student_name(output.student_id) ?? "---"
            }
            stdout={output.stdout}
            stderr={output.stderr}
            timeout={timeout}
            total_time={output.total_time}
          />
        );
      })}
    </Card>
  );
}

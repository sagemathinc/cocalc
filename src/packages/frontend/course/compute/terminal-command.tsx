import { Button, Card, Input, InputNumber, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { type CSSProperties, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { plural } from "@cocalc/util/misc";
import { getServerId } from "./students";
import type { SelectedStudents, ServersMap } from "./students";
import type { StudentsMap, Unit } from "../store";

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
  students,
  unit,
}: {
  style?: CSSProperties;
  servers: ServersMap;
  selected: SelectedStudents;
  students: StudentsMap;
  unit: Unit;
}) {
  const [timeout, setTimeout] = useState<number | null>(1);
  const [input, setInput] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const runningStudentIds: string[] = Array.from(selected).filter(
    (student_id) =>
      servers[getServerId({ unit, student_id })]?.state == "running",
  );

  const runTerminalCommand = () => {
    try {
      setRunning(true);
      console.log("would run ", { input, students });
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
          style={{ fontFamily: "monospace" }}
          placeholder={"Terminal command to run on compute servers..."}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
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
        style={{ maxWidth: "300px" }}
        value={timeout}
        onChange={(t) => setTimeout(t ?? null)}
        min={1}
        max={60 * 24}
        addonAfter={"minute timeout"}
      />
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
    </Card>
  );
}

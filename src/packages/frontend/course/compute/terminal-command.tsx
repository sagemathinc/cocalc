import { Button, Card, Input, InputNumber, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";

export default function ComputeServerTerminalCommand({ style }: { style? }) {
  const [timeout, setTimeout] = useState<number | null>(1);
  const [input, setInput] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const runTerminalCommand = () => {
    try {
      setRunning(true);
      console.log("would run ", { input });
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
          <Icon name="terminal" /> Run Terminal Command on all Student Compute
          Servers
        </>
      }
      style={style}
    >
      <Space.Compact
        style={{
          display: "flex",
          whiteSpace: "nowrap",
          marginBottom: "5px",
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
          disabled={running}
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

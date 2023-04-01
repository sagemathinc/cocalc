import { CSSProperties, useEffect, useState } from "react";
import { Alert, Button, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import LRU from "lru-cache";
const sha1 = require("sha1");
import { isEqual } from "lodash";
import NBViewerCellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import { useFileContext } from "@cocalc/frontend/lib/file-context";

const cache = new LRU<
  string,
  { input: string; history?: string[]; kernel: string; output: object[] }
>({
  max: 500,
  maxSize: 10000000,
  sizeCalculation: ({ input, history, output }) => {
    let s = input.length + output.length;
    if (history != null) {
      for (const h of history) {
        s += h.length;
      }
    }
    return s;
  },
});

interface Props {
  kernel: string;
  style?: CSSProperties;
  input?: string;
  history?: string[];
  setOutput?: (output) => void;
}

export default function RunButton({
  kernel,
  style,
  input,
  history,
  setOutput,
}: Props) {
  const { jupyterApiEnabled } = useFileContext();
  const [running, setRunning] = useState<boolean>(false);
  useEffect(() => {
    if (!jupyterApiEnabled || setOutput == null) return;
    const output = getFromCache({ input, history, kernel });
    if (output != null) {
      setOutput(<Output output={output} setOutput={setOutput} />);
    } else {
      setOutput(null);
    }
  }, [input, history, kernel]);
  if (!jupyterApiEnabled) return null;

  // TODO: nicer display name for the kernel
  return (
    <Tooltip
      title={`Run this code in an isolated remote sandbox using the ${kernel} Jupyter kernel.`}
    >
      <Button
        size="small"
        type="text"
        style={style}
        disabled={!input?.trim() || running}
        onClick={async () => {
          try {
            setRunning(true);
            setOutput?.(null);
            const resp = await (
              await fetch(join(appBasePath, "api/v2/jupyter/execute"), {
                method: "POST",
                body: JSON.stringify({ input, history, kernel }),
                headers: {
                  "Content-Type": "application/json",
                },
              })
            ).json();
            if (resp.error && setOutput != null) {
              setOutput(<Output error={resp.error} setOutput={setOutput} />);
            }
            if (resp.output) {
              if (setOutput != null) {
                setOutput(
                  <Output output={resp.output} setOutput={setOutput} />
                );
              }
              saveToCache({ input, history, kernel, output: resp.output });
            }
          } catch (err) {
            if (setOutput != null) {
              setOutput(<Output error={err} setOutput={setOutput} />);
            }
          } finally {
            setRunning(false);
          }
        }}
      >
        <Icon name={running ? "cocalc-ring" : "play"} spin={running} />
        {running ? "Running" : "Run"}
      </Button>
    </Tooltip>
  );
}

function Output({ error, output, setOutput }: { error?; output?; setOutput }) {
  return (
    <Alert
      type={error ? "error" : "success"}
      style={
        error ? { margin: "5px 0" } : { background: "white", margin: "5px 0" }
      }
      description={
        error ? error : <NBViewerCellOutput cell={{ output }} hidePrompt />
      }
      closable
      onClose={() => setOutput(null)}
    />
  );
}

function getKey({ input, history, kernel }) {
  return sha1(JSON.stringify([input, history, kernel]));
}

function getFromCache({ input, history, kernel }) {
  const key = getKey({ input, history, kernel });
  const x = cache.get(key);
  if (x != null) {
    if (
      x.kernel == kernel &&
      x.input == input &&
      isEqual(x.history ?? null, history ?? null)
    ) {
      return x.output;
    }
  }
}

function saveToCache({ input, history, kernel, output }) {
  const key = getKey({ input, history, kernel });
  cache.set(key, { input, history, kernel, output });
}

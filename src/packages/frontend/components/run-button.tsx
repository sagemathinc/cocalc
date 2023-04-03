import { CSSProperties, MutableRefObject, useEffect, useState } from "react";
import { Alert, Button, Select, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import LRU from "lru-cache";
const sha1 = require("sha1");
import { isEqual } from "lodash";

import { useFileContext } from "@cocalc/frontend/lib/file-context";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import { capitalize, closest_kernel_match } from "@cocalc/util/misc";
import { guesslang } from "@cocalc/frontend/misc/detect-language";
import { fromJS } from "immutable";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";

// Important -- we import init-nbviewer , since otherwise NBViewerCellOutput won't
// be able to render any mime types until the user opens a Jupyter notebook.
import NBViewerCellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";

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

export type RunFunction = () => Promise<void>;
type RunRef = MutableRefObject<RunFunction | null>;

export interface Props {
  kernel: string;
  style?: CSSProperties;
  input?: string;
  history?: string[];
  setOutput?: (output) => void;
  runRef?: RunRef;
}

export default function RunButton({
  kernel,
  style,
  input,
  history,
  setOutput,
  runRef,
}: Props) {
  const { jupyterApiEnabled } = useFileContext();
  const [running, setRunning] = useState<boolean>(false);

  // actual kernel to use:
  const [kernelName, setKernelName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!jupyterApiEnabled || setOutput == null) return;
    const { output, cacheKey } = getFromCache({ input, history, kernel });
    if (output != null) {
      setOutput(
        <Output output={output} setOutput={setOutput} cacheKey={cacheKey} />
      );
    } else {
      setOutput(null);
    }
  }, [input, history, kernel]);
  if (!jupyterApiEnabled) return null;

  const run = async ({
    noCache,
    forceKernel,
  }: { noCache?: boolean; forceKernel?: string } = {}) => {
    const cacheKey = getKey({ input, history, kernel });
    try {
      setRunning(true);
      setOutput?.(null);
      let kernelToUse;
      if (forceKernel) {
        kernelToUse = forceKernel;
      } else if (kernelName) {
        kernelToUse = kernelName;
      } else {
        kernelToUse = await guessKernel({
          kernel,
          code: (history ?? []).concat([input ?? ""]).join("\n"),
        });
        setKernelName(kernelToUse);
      }
      const resp = await (
        await fetch(join(appBasePath, "api/v2/jupyter/execute"), {
          method: "POST",
          body: JSON.stringify({
            input,
            history,
            kernel: kernelToUse,
            noCache,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        })
      ).json();
      if (resp.error && setOutput != null) {
        setOutput(
          <Output
            error={resp.error}
            setOutput={setOutput}
            cacheKey={cacheKey}
          />
        );
      }
      if (resp.output != null) {
        if (setOutput != null) {
          setOutput(
            <Output
              output={resp.output}
              setOutput={setOutput}
              cacheKey={cacheKey}
            />
          );
        }
        saveToCache({ input, history, kernel, output: resp.output });
      }
    } catch (err) {
      if (setOutput != null) {
        setOutput(
          <Output error={err} setOutput={setOutput} cacheKey={cacheKey} />
        );
      }
    } finally {
      setRunning(false);
    }
  };
  if (runRef != null) {
    runRef.current = run;
  }

  const disabled = !input?.trim() || running;
  return (
    <Tooltip
      overlayInnerStyle={{ width: "260px" }}
      title={
        <div>
          Run this code in an isolated sandbox using{" "}
          {kernelName ? "the " + kernelDisplayName(kernelName) : "a"} Jupyter
          kernel.
          <div
            style={{
              display: "flex",
              marginTop: "5px",
              padding: "5px",
              borderRadius: "3px",

              background: disabled ? "white" : undefined,
            }}
          >
            <KernelSelector
              disabled={disabled}
              onSelect={(name) => {
                setKernelName(name);
                run({ forceKernel: name });
              }}
              kernel={kernelName}
            />
            <Button
              style={{ marginLeft: "5px" }}
              disabled={disabled}
              size="small"
              onClick={() => run({ noCache: true })}
            >
              <Icon name={running ? "cocalc-ring" : "redo"} spin={running} />
              {running ? "Running" : "Run Again"}
            </Button>
          </div>
          {running && (
            <ProgressEstimate seconds={30} style={{ width: "100%" }} />
          )}
        </div>
      }
    >
      <div style={{ display: "flex" }}>
        <Button
          size="small"
          type="text"
          style={style}
          disabled={disabled}
          onClick={run}
        >
          <Icon name={running ? "cocalc-ring" : "play"} spin={running} />
          Run
        </Button>
      </div>
    </Tooltip>
  );
}

function Output({
  error,
  output,
  setOutput,
  cacheKey,
}: {
  error?;
  output?;
  setOutput;
  cacheKey: string;
}) {
  return (
    <Alert
      type={error ? "error" : "success"}
      style={
        error ? { margin: "5px 0" } : { background: "white", margin: "5px 0" }
      }
      description={
        error ? `${error}` : <NBViewerCellOutput cell={{ output }} hidePrompt />
      }
      closable
      onClose={() => {
        setOutput(null);
        // if you close it you probably don't want it to magically reappear on render
        // unless you explicitly re-evalute
        cache.delete(cacheKey);
      }}
    />
  );
}

function getKey({ input, history, kernel }) {
  return sha1(
    JSON.stringify([input.trim(), history?.map((x) => x.trim()), kernel.trim()])
  );
}

function getFromCache({ input, history, kernel }): {
  cacheKey: string;
  output?: object[];
} {
  const cacheKey = getKey({ input, history, kernel });
  const x = cache.get(cacheKey);
  if (x != null) {
    if (
      x.kernel == kernel &&
      x.input == input &&
      isEqual(x.history ?? null, history ?? null)
    ) {
      return { cacheKey, output: x.output };
    }
  }
  return { cacheKey };
}

function saveToCache({ input, history, kernel, output }) {
  const key = getKey({ input, history, kernel });
  cache.set(key, { input, history, kernel, output });
}

let kernelInfoCache: null | KernelSpec[] = null;
async function getKernelInfo(): Promise<KernelSpec[]> {
  if (kernelInfoCache == null) {
    // for now, only get this once since highly unlikely to change during a session.  TODO...
    const url = join(appBasePath, "api/v2/jupyter/kernels");
    kernelInfoCache = (
      await (
        await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })
      ).json()
    ).kernels;
  }
  if (kernelInfoCache == null) {
    throw Error("unable to determine the available Jupyter kernels");
  }
  return kernelInfoCache;
}

function kernelDisplayName(name: string): string {
  if (kernelInfoCache == null) {
    getKernelInfo(); // launch it.
    return capitalize(name);
  }
  for (const k of kernelInfoCache) {
    if (k.name == name) {
      return k.display_name;
    }
  }
  return capitalize(name);
}

async function guessKernel({ kernel, code }): Promise<string> {
  if (kernel == "python") {
    kernel = "python3";
  }
  const kernelInfo = await getKernelInfo();
  if (kernelInfo.length == 0) {
    throw Error("there are no available kernels");
  }
  if (!kernel) {
    // we guess something since nothing was giving. We use the code in the input and history.
    const guesses = await guesslang(code);
    kernel = guesses[0] ?? "python3";
  }
  for (const { name, display_name, language } of kernelInfo) {
    if (name == kernel) {
      // kernel exactly matches a known kernel, so obviously use that.
      return name;
    }
    if (kernel == language) {
      return name;
    }
    if (kernel.toLowerCase() == display_name.toLowerCase()) {
      return name;
    }
  }
  // No really clear match, so use closest_kernel_match.
  // TODO: it's silly converting to immutable.js constantly...
  const result = closest_kernel_match(kernel, fromJS(kernelInfo)).get("name");
  return result;
}

function KernelSelector({
  //code,
  kernel,
  onSelect,
  disabled,
}: {
  //code?: string;
  kernel?: string;
  onSelect: (name: string) => void;
  disabled?: boolean;
}) {
  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null>(null);
  useEffect(() => {
    (async () => {
      setKernelSpecs(await getKernelInfo());
    })();
  }, []);

  return (
    <Select
      showSearch
      placeholder="Kernel..."
      optionFilterProp="children"
      filterOption={(input, option) =>
        (option?.display_name ?? "").toLowerCase().includes(input.toLowerCase())
      }
      size="small"
      style={{ width: "125px" }}
      disabled={disabled}
      options={
        kernelSpecs != null
          ? kernelSpecs
              ?.filter((spec) => !spec?.metadata?.["cocalc"]?.disabled)
              .map((spec) => {
                return {
                  display_name: spec.display_name,
                  label: (
                    <Tooltip title={spec.display_name}>
                      {spec.display_name}
                    </Tooltip>
                  ),
                  value: spec.name,
                };
              })
          : []
      }
      onChange={onSelect}
      value={kernel}
    />
  );
}

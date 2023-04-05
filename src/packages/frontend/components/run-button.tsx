import {
  CSSProperties,
  ReactNode,
  MutableRefObject,
  useEffect,
  useState,
} from "react";
import { Alert, Button, Popover, Select, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import LRU from "lru-cache";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import { capitalize, closest_kernel_match } from "@cocalc/util/misc";
import { guesslang } from "@cocalc/frontend/misc/detect-language";
import { fromJS } from "immutable";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import computeHash from "@cocalc/util/jupyter-api/compute-hash";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import { file_associations } from "@cocalc/frontend/file-associations";

// Important -- we import init-nbviewer , since otherwise NBViewerCellOutput won't
// be able to render any mime types until the user opens a Jupyter notebook.
import NBViewerCellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";

const cache = new LRU<string, object[]>({
  max: 500,
  maxSize: 10000000,
  sizeCalculation: (output) => {
    const n = output?.length;
    return n ? n : 1;
  },
});

export type RunFunction = () => Promise<void>;
type RunRef = MutableRefObject<RunFunction | null>;

export interface Props {
  info: string;
  style?: CSSProperties;
  input?: string;
  history?: string[];
  output?: ReactNode | null;
  setOutput?: (output: ReactNode | null) => void;
  runRef?: RunRef;
}

export default function RunButton({
  info, // markdown info mode line; use {kernel='blah'} to explicitly specify a kernel; otherwise, uses heuristics
  style,
  input = "",
  history,
  output,
  setOutput,
  runRef,
}: Props) {
  const { jupyterApiEnabled } = useFileContext();
  const [running, setRunning] = useState<boolean>(false);

  // actual kernel to use:
  const [kernelName, setKernelName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!jupyterApiEnabled || setOutput == null) return;
    const { output, cacheKey } = getFromCache({ input, history, info });
    if (output != null) {
      setOutput(
        <Output output={output} setOutput={setOutput} cacheKey={cacheKey} />
      );
    } else {
      setOutput(null);
      // but we try to asynchronously get the output from the
      // backend, if available
      (async () => {
        const kernel = await getKernel({ input, history, info });
        setKernelName(kernel);
        const hash = computeHash({
          input,
          history,
          kernel,
        });
        const cachedOutput = await getFromDatabaseCache(hash);
        if (cachedOutput != null) {
          saveToCache({ input, history, info, output: cachedOutput });
          setOutput(
            <Output
              output={cachedOutput}
              setOutput={setOutput}
              cacheKey={cacheKey}
            />
          );
        }
      })();
    }
  }, [input, history, info]);

  if (!jupyterApiEnabled) return null;

  const run = async ({
    noCache,
    forceKernel,
  }: { noCache?: boolean; forceKernel?: string } = {}) => {
    const cacheKey = computeHash({ input, history, kernel: info });
    try {
      setRunning(true);
      setOutput?.(null);
      let kernel;
      if (forceKernel) {
        kernel = forceKernel;
      } else if (kernelName) {
        kernel = kernelName;
      } else {
        kernel = await getKernel({ input, history, info });
        setKernelName(kernel);
      }
      const resp = await (
        await fetch(join(appBasePath, "api/v2/jupyter/execute"), {
          method: "POST",
          body: JSON.stringify({
            input,
            history,
            kernel,
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
        saveToCache({ input, history, info, output: resp.output });
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
    <Popover
      trigger="hover"
      overlayInnerStyle={{ width: "400px" }}
      title={
        <>
          <Icon
            name="jupyter"
            style={{ marginRight: "5px", fontSize: "16px" }}
          />
          Run this code and show output
        </>
      }
      content={
        <div>
          Code is run in an isolated sandbox using{" "}
          {kernelName ? "the " + kernelDisplayName(kernelName) : "a"} Jupyter
          kernel. Code with the same kernel and scope is always run in order.
          There is a hard timeout of 30 seconds.
          <div
            style={{
              width: "100%",
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
              style={{ marginLeft: "5px", flex: 1 }}
              disabled={disabled}
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
          onClick={() => {
            if (output == null) {
              run();
            } else {
              setOutput?.(null);
            }
          }}
        >
          <Icon
            name={
              running
                ? "cocalc-ring"
                : output == null
                ? "square"
                : "check-square"
            }
            spin={running}
          />
          Show Output
        </Button>
      </div>
    </Popover>
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
  // todo - not used
  [setOutput, cacheKey];
  if (error) {
    return (
      <Alert
        type={error ? "error" : "success"}
        style={{
          margin: "5px 0 5px 30px",
        }}
        description={`${error}`}
      />
    );
  }
  return (
    <div
      style={{
        margin: "5px 0 5px 30px",
        padding: "10px",
        background: "white",
        border: "1px solid #ccc",
        borderLeft: "5px solid #389e0d",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <NBViewerCellOutput cell={{ output }} hidePrompt />
    </div>
  );
}

function getFromCache({ input, history, info }): {
  cacheKey: string;
  output?: object[];
} {
  const cacheKey = computeHash({ input, history, kernel: info });
  const output = cache.get(cacheKey);
  if (output != null) return { cacheKey, output };
  return { cacheKey };
}

function saveToCache({ input, history, info, output }) {
  const key = computeHash({ input, history, kernel: info });
  cache.set(key, output);
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

async function guessKernel({ info, code }): Promise<string> {
  if (info == "python") {
    info = "python3";
  }
  const kernelInfo = await getKernelInfo();
  if (kernelInfo.length == 0) {
    throw Error("there are no available kernels");
  }
  if (!info) {
    // we guess something since nothing was giving. We use the code in the input and history.
    const guesses = await guesslang(code);
    // TODO: should restrict guesses to available kernels...
    info = guesses[0] ?? "python3";
  }

  const mode = infoToMode(info, { preferKernel: true });
  const cmmode = file_associations[mode]?.opts?.mode;
  for (const { name, display_name, language } of kernelInfo) {
    if (name == mode) {
      // mode exactly matches a known kernel, so obviously use that.
      return name;
    }
    if (mode == language) {
      return name;
    }
    if (mode == display_name.toLowerCase()) {
      return name;
    }
    if (cmmode == language) {
      return name;
    }
  }
  // No really clear match, so use closest_kernel_match.
  // TODO: it's silly converting to immutable.js constantly...
  const result = closest_kernel_match(mode, fromJS(kernelInfo)).get("name");
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
      style={{ flex: 1 }}
      disabled={disabled}
      options={
        kernelSpecs != null
          ? kernelSpecs
              ?.filter((spec) => !spec?.metadata?.["cocalc"]?.disabled)
              .map((spec) => {
                return {
                  display_name: spec.display_name,
                  label: (
                    <Tooltip title={spec.display_name} placement="left">
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

const getFromDatabaseCache = async (hash: string) => {
  const resp = await (
    await fetch(join(appBasePath, "api/v2/jupyter/execute"), {
      method: "POST",
      body: JSON.stringify({ hash }),
      headers: {
        "Content-Type": "application/json",
      },
    })
  ).json();
  if (resp.error) {
    throw Error(resp.error);
  }
  return resp.output ?? null;
};

async function getKernel({ input, history, info }): Promise<string> {
  return await guessKernel({
    info,
    code: (history ?? []).concat([input ?? ""]).join("\n"),
  });
}

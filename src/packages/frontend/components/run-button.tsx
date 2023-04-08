import {
  CSSProperties,
  ReactNode,
  MutableRefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, Button, Popover, Select, Tooltip, Typography } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import LRU from "lru-cache";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import {
  capitalize,
  closest_kernel_match,
  path_split,
} from "@cocalc/util/misc";
import { guesslang } from "@cocalc/frontend/misc/detect-language";
import { fromJS } from "immutable";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import computeHash from "@cocalc/util/jupyter-api/compute-hash";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import TimeAgo from "react-timeago";
import Logo from "@cocalc/frontend/jupyter/logo";

// Important -- we import init-nbviewer , since otherwise NBViewerCellOutput won't
// be able to render any mime types until the user opens a Jupyter notebook.
import NBViewerCellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";

const cache = new LRU<string, { output: object[]; kernel: string }>({
  max: 500,
  maxSize: 10000000,
  sizeCalculation: ({ output }) => {
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
  output: ReactNode | null;
  setOutput: (output: ReactNode | null) => void;
  runRef?: RunRef;
}

export default function RunButton({
  info, // markdown info mode line; use {kernel='blah'} to explicitly specify a kernel; otherwise, uses heuristics
  style,
  input = "",
  history,
  output,
  setOutput: setOutput0,
  runRef,
}: Props) {
  const {
    jupyterApiEnabled,
    project_id,
    path: filename,
    is_visible,
  } = useFileContext();
  const path = project_id && filename ? path_split(filename).head : undefined;
  const [running, setRunning] = useState<boolean>(false);
  const outputMessagesRef = useRef<object[] | null>(null);

  // when the computation happened.
  const [created, setCreated] = useState<Date | null | undefined>(null);

  const setOutput = ({
    messages = null,
    old,
    error,
    running,
  }: {
    messages?: object[] | null;
    old?: boolean;
    error?: string;
    running?: boolean;
  } = {}) => {
    if (running) {
      setOutput0(
        outputMessagesRef.current == null ? null : (
          <Output output={outputMessagesRef.current} running />
        )
      );
    } else if (error) {
      outputMessagesRef.current = null;
      setOutput0(<Output error={error} />);
    } else if (old) {
      setOutput0(
        outputMessagesRef.current == null ? null : (
          <Output output={outputMessagesRef.current} old />
        )
      );
    } else {
      outputMessagesRef.current = messages;
      setOutput0(messages == null ? null : <Output output={messages} />);
    }
  };

  // actual kernel to use:
  const [kernelName, setKernelName] = useState<string | undefined>(undefined);
  const [showPopover, setShowPopover] = useState<boolean>(false);

  useEffect(() => {
    if (!jupyterApiEnabled || setOutput == null || running) return;
    const { output: messages, kernel: usedKernel } = getFromCache({
      input,
      history,
      info,
      project_id,
      path,
    });
    if (messages != null) {
      setOutput({ messages });
      setKernelName(usedKernel);
    } else {
      setOutput({ old: true });
      // but we try to asynchronously get the output from the
      // backend, if available
      (async () => {
        let kernel;
        try {
          kernel = await getKernel({ input, history, info, project_id });
        } catch (err) {
          // could fail, e.g., if user not signed in.  shouldn't be fatal.
          console.log(err);
          return;
        }
        setKernelName(kernel);
        const hash = computeHash({
          input,
          history,
          kernel,
          project_id,
          path,
        });
        const { output: messages, created } = await getFromDatabaseCache(hash);
        if (messages != null) {
          saveToCache({
            input,
            history,
            info,
            output: messages,
            project_id,
            path,
            kernel,
          });
          setOutput({ messages });
          setCreated(created);
        }
      })();
    }
  }, [input, history, info]);

  if (!jupyterApiEnabled && !project_id) {
    // run button is not enabled when no project_id given.
    return null;
  }

  const run = async ({
    noCache,
    forceKernel,
  }: { noCache?: boolean; forceKernel?: string } = {}) => {
    try {
      setRunning(true);
      setOutput({ running: true });
      let kernel;
      1;
      if (forceKernel) {
        kernel = forceKernel;
      } else if (kernelName) {
        kernel = kernelName;
      } else {
        kernel = await getKernel({ input, history, info, project_id });
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
            project_id,
            path,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        })
      ).json();
      if (resp.error && setOutput != null) {
        setOutput({ error: resp.error });
      }
      if (resp.output != null) {
        setOutput({ messages: resp.output });
        setCreated(resp.created);
        saveToCache({
          input,
          history,
          info,
          output: resp.output,
          project_id,
          path,
          kernel,
        });
      }
    } catch (error) {
      setOutput({ error });
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
      open={is_visible && showPopover}
      trigger={"click"}
      overlayInnerStyle={{ width: "350px" }}
      title={
        <>
          <Button
            type="text"
            onClick={() => setShowPopover(false)}
            style={{ float: "right" }}
          >
            <Icon name="times" />
          </Button>
          <Icon
            name="jupyter"
            style={{ marginRight: "5px", fontSize: "20px" }}
          />
          Run Code using Jupyter
        </>
      }
      content={
        <div>
          <Typography.Paragraph
            ellipsis={{
              rows: 1,
              expandable: true,
              symbol: <strong>more</strong>,
            }}
          >
            Run {project_id ? "" : "in an isolated sandbox"}
            {" using "}
            {kernelName ? (
              <>
                the <b>{kernelDisplayName(kernelName, project_id)}</b>
              </>
            ) : (
              "a"
            )}{" "}
            Jupyter kernel. Cells in this document with the same kernel and
            scope are automatically run. You don't have to worry about
            explicitly running earlier cells. Execution time is limited.
          </Typography.Paragraph>
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
                setShowPopover(false);
              }}
              kernel={kernelName}
              project_id={project_id}
            />
          </div>
          {created && (
            <div
              style={{
                textAlign: "right",
                borderTop: "1px dashed #ddd",
                marginTop: "5px",
                paddingTop: "5px",
                color: "#666",
                fontSize: "12px",
              }}
            >
              Last Run:{" "}
              <TimeAgo date={created >= new Date() ? new Date() : created} />
              <div style={{ textAlign: "center" }}>
                <Button
                  onClick={() => {
                    setShowPopover(false);
                    run({ noCache: true });
                  }}
                >
                  <Icon
                    style={running ? { color: "#389e0d" } : undefined}
                    name={running ? "cocalc-ring" : "redo"}
                    spin={running}
                  />
                  Run Now (clear cache)
                </Button>
              </div>
            </div>
          )}
        </div>
      }
    >
      <div style={{ display: "flex" }}>
        <Button.Group>
          <Tooltip title={output == null ? "Run this code" : "Hide output"}>
            <Button
              size="small"
              style={style}
              disabled={disabled}
              onClick={() => {
                setShowPopover(false);
                if (output == null) {
                  run({ noCache: false });
                } else {
                  setOutput();
                }
              }}
            >
              <Icon
                style={running ? { color: "#389e0d" } : undefined}
                name={
                  running
                    ? "cocalc-ring"
                    : output == null
                    ? "step-forward"
                    : "check-square"
                }
                spin={running}
              />
              Run
            </Button>
          </Tooltip>
          <Tooltip title="Configure Jupyter kernel..." placement="bottom">
            <Button
              size="small"
              style={{
                ...style,
                ...(showPopover ? { background: "#ccc" } : undefined),
              }}
              onClick={() => {
                setShowPopover(!showPopover);
              }}
            >
              {project_id && kernelName ? (
                <Logo
                  kernel={kernelName}
                  size={18}
                  style={{ marginRight: "5px" }}
                />
              ) : (
                <Icon name={"jupyter"} />
              )}
              {kernelName ? kernelDisplayName(kernelName, project_id) : null}
            </Button>
          </Tooltip>
        </Button.Group>
      </div>
    </Popover>
  );
}

function Output({
  error,
  output,
  old,
  running,
  style,
}: {
  error?;
  output?;
  old?: boolean;
  running?: boolean;
  style?: CSSProperties;
}) {
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
  if (output == null) {
    return null;
  }
  return (
    <>
      {running && <ProgressEstimate seconds={15} style={{ width: "100%" }} />}
      <div
        style={{
          color: "#444",
          maxHeight: "35vh",
          overflowY: "auto",
          ...style,
          ...(old || running ? { opacity: 0.2 } : undefined),
        }}
      >
        <NBViewerCellOutput cell={{ output }} hidePrompt />
      </div>
    </>
  );
}

function getFromCache({
  input,
  history,
  info,
  project_id,
  path,
}):
  | { kernel: string; output: object[] }
  | { kernel: undefined; output: undefined } {
  const cacheKey = computeHash({
    input,
    history,
    kernel: info,
    project_id,
    path,
  });
  return cache.get(cacheKey) ?? { kernel: undefined, output: undefined };
}

function saveToCache({
  input,
  history,
  info,
  project_id,
  path,
  output,
  kernel,
}) {
  const key = computeHash({ input, history, kernel: info, project_id, path });
  cache.set(key, { output, kernel });
}

const kernelInfoCache = new LRU<string, KernelSpec[]>({
  ttl: 30000,
  max: 50,
});
function kernelInfoCacheKey(project_id: string | undefined) {
  return project_id ?? "global";
}
function getKernelInfoCacheOnly(project_id: string | undefined) {
  return kernelInfoCache.get(kernelInfoCacheKey(project_id));
}
async function getKernelInfo(
  project_id: string | undefined
): Promise<KernelSpec[]> {
  const key = kernelInfoCacheKey(project_id);
  let specs = kernelInfoCache.get(key);
  if (specs != null) return specs;
  const url = join(appBasePath, "api/v2/jupyter/kernels");
  const resp = await (
    await fetch(url, {
      method: project_id ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
      },
      ...(project_id // can't pass body at all to GET!
        ? { body: JSON.stringify({ project_id }) }
        : undefined),
    })
  ).json();
  if (resp.error) {
    throw Error(resp.error);
  }
  specs = resp.kernels;
  if (specs == null) {
    throw Error("bug");
  }
  kernelInfoCache.set(key, specs);
  return specs;
}

function kernelDisplayName(
  name: string,
  project_id: string | undefined
): string {
  const kernelInfo = getKernelInfoCacheOnly(project_id);
  if (kernelInfo == null) {
    async () => {
      try {
        await getKernelInfo(project_id); // refresh cache
      } catch (err) {
        // e.g., if you user isn't signed in and project_id is set, this will fail, but shouldn't be fatal.
        console.warn(err);
      }
    };
    return capitalize(name);
  }
  for (const k of kernelInfo) {
    if (k.name == name) {
      return k.display_name;
    }
  }
  return capitalize(name);
}

async function guessKernel({ info, code, project_id }): Promise<string> {
  if (info == "python") {
    info = "python3";
  }
  const kernelInfo = await getKernelInfo(project_id);
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
  project_id,
}: {
  //code?: string;
  kernel?: string;
  onSelect: (name: string) => void;
  disabled?: boolean;
  project_id?: string;
}) {
  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null>(null);
  useEffect(() => {
    (async () => {
      setKernelSpecs(await getKernelInfo(project_id));
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
                      {project_id && (
                        <Logo
                          kernel={spec.name}
                          size={18}
                          style={{ marginRight: "5px" }}
                        />
                      )}{" "}
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

async function getFromDatabaseCache(hash: string): Promise<{
  output?: object[];
  created?: Date;
}> {
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
  return resp;
}

async function getKernel({
  input,
  history,
  info,
  project_id,
}): Promise<string> {
  return await guessKernel({
    info,
    code: (history ?? []).concat([input ?? ""]).join("\n"),
    project_id,
  });
}

/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Popover, Tooltip } from "antd";
import {
  CSSProperties,
  MutableRefObject,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import TimeAgo from "react-timeago";

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
//import { file_associations } from "@cocalc/frontend/file-associations";
//import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import Logo from "@cocalc/frontend/jupyter/logo";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import computeHash from "@cocalc/util/jupyter-api/compute-hash";
import { path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import api from "./api";
import { getFromCache, saveToCache } from "./cache";
import getKernel from "./get-kernel";
import { kernelDisplayName, kernelLanguage } from "./kernel-info";
import Output from "./output";
import SelectKernel from "./select-kernel";

// ATTN[i18n]: it's tempting to translate this, but it is a dependency of next (vouchers/notes → slate/code-block → buttons)

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
  tag?: string;
  size;
  // automatically check for known output in database on initial load, e.g.,
  // yes for markdown, but not for a jupyter notebook on the share server.
  auto?: boolean;

  setInfo?: (info: string) => void;
}

// definitely never show run buttons for text formats that can't possibly be run.
// TODO: This sort of stuff should be in a spec file, like file associations
const NO_RUN = new Set([
  "txt",
  "text",
  "md",
  "rmd",
  "qmd",
  "tex",
  "latex",
  "markdown",
  "yaml",
  "yaml-frontmatter",
  "json",
]);

export default function RunButton({
  info, // markdown info mode line; use {kernel='blah'} to explicitly specify a kernel; otherwise, uses heuristics
  style,
  input = "",
  history,
  output,
  setOutput: setOutput0,
  runRef,
  tag,
  size,
  auto,
  setInfo,
}: Props) {
  const mode = infoToMode(info);

  const {
    disableMarkdownCodebar,
    jupyterApiEnabled,
    project_id,
    path: filename,
    is_visible,
    /*hasOpenAI, */
  } = useFileContext();
  const noRun = NO_RUN.has(mode) || disableMarkdownCodebar;
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
      setOutput0(<Output output={outputMessagesRef.current} running />);
    } else if (error) {
      outputMessagesRef.current = null;
      setOutput0(<Output error={error} />);
    } else if (old) {
      setOutput0(
        outputMessagesRef.current == null ? null : (
          <Output output={outputMessagesRef.current} old />
        ),
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
    if (
      noRun ||
      !jupyterApiEnabled ||
      setOutput == null ||
      running ||
      !info.trim()
    ) {
      return;
    }
    const { output: messages, kernel: usedKernel } = getFromCache({
      input,
      history,
      info,
      project_id,
      path,
    });
    if (!info) {
      setKernelName(undefined);
    }
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
          console.warn(`WARNING: ${err}`);
          return;
        }
        setKernelName(kernel);
        if (!auto && outputMessagesRef.current == null) {
          // we don't initially automatically check database since auto is false.
          return;
        }

        const hash = computeHash({
          input,
          history,
          kernel,
          project_id,
          path,
        });
        let x;
        try {
          x = await getFromDatabaseCache(hash);
        } catch (err) {
          console.warn(`WARNING: ${err}`);
          return;
        }
        const { output: messages, created } = x;
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

  if (noRun || (!jupyterApiEnabled && !project_id)) {
    // run button is not enabled when no project_id given, or not info at all.
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
        try {
          kernel = await getKernel({ input, history, info, project_id });
        } catch (error) {
          // can fail, e.g., if user got signed out or doesn't have access to project
          setOutput({ error: `${error}` });
          return;
        }
        setKernelName(kernel);
      }
      let resp;
      try {
        if (!kernel) {
          setOutput({ error: "Select a Kernel" });
          return;
        }
        resp = await api("execute", {
          input,
          history,
          kernel,
          noCache,
          project_id,
          path,
          tag,
        });
      } catch (err) {
        if (resp?.error != null) {
          setOutput({ error: resp.error });
        } else {
          setOutput({ error: `Timeout or communication problem` });
        }
        return;
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
    <div style={{ display: "flex" }}>
      <Tooltip
        placement="bottom"
        title={
          !kernelName
            ? "Select a kernel if you want to run this code."
            : "Run this and anything above in this markdown with the same info string."
        }
      >
        <Button
          size={size}
          style={style}
          disabled={disabled || !kernelName}
          onClick={() => {
            setShowPopover(false);
            run({ noCache: false });
          }}
        >
          <Icon
            style={running ? { color: COLORS.RUN } : undefined}
            name={running ? "cocalc-ring" : "step-forward"}
            spin={running}
          />
          Run
        </Button>
      </Tooltip>
      <Popover
        open={project_id == null ? undefined : is_visible && showPopover}
        trigger={project_id == null ? "click" : []}
        overlayInnerStyle={{ width: "350px" }}
        title={
          <>
            {project_id != null && (
              <Button
                type="text"
                onClick={() => setShowPopover(false)}
                style={{ float: "right" }}
              >
                <Icon name="times" />
              </Button>
            )}
            <Icon
              name="jupyter"
              style={{ marginRight: "5px", fontSize: "20px" }}
            />
            Run Code using Jupyter
          </>
        }
        content={
          <div>
            <div>
              Run {project_id ? "" : "in an isolated sandbox"}
              {" using "}
              {kernelName ? (
                <>
                  the <b>{kernelDisplayName(kernelName, project_id)}</b>
                </>
              ) : (
                "a"
              )}{" "}
              Jupyter kernel. Execution time is limited.{" "}
              {history != null && history.length > 0 && (
                <>
                  The following code from {history.length}{" "}
                  {plural(history.length, "cell")} above with the same info
                  string will always be run first:
                  <div style={{ height: "5px" }} />
                  <CodeMirrorStatic
                    style={{
                      maxHeight: "75px",
                      overflowY: "auto",
                      margin: "5px",
                    }}
                    options={{ mode: infoToMode(info) }}
                    value={history.join("\n\n")}
                  />
                </>
              )}
            </div>
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
              <SelectKernel
                disabled={running}
                onSelect={(name) => {
                  setKernelName(name);
                  setShowPopover(false);
                  setInfo?.(
                    `${kernelLanguage(name, project_id)} {kernel="${name}"}`,
                  );
                }}
                kernel={kernelName}
                project_id={project_id}
              />
            </div>
            {created && (
              <div
                style={{
                  textAlign: "center",
                  borderTop: "1px dashed #ddd",
                  marginTop: "5px",
                  paddingTop: "5px",
                  color: "#666",
                }}
              >
                <div style={{ marginBottom: "5px" }}>
                  Last Run:{" "}
                  <TimeAgo
                    date={created >= new Date() ? new Date() : created}
                  />
                </div>
                <Button.Group>
                  <Button
                    onClick={() => {
                      setShowPopover(false);
                      run({ noCache: true });
                    }}
                  >
                    <Icon
                      style={running ? { color: COLORS.RUN } : undefined}
                      name={running ? "cocalc-ring" : "step-forward"}
                      spin={running}
                    />
                    Run Now
                  </Button>
                  <Button
                    disabled={output == null}
                    onClick={() => {
                      setShowPopover(false);
                      setOutput({ messages: null });
                    }}
                  >
                    Hide Output
                  </Button>
                </Button.Group>
              </div>
            )}
          </div>
        }
      >
        <Tooltip title="Configure..." placement="bottom">
          <Button
            type="link"
            size={size}
            style={{
              ...style,
              ...(project_id != null && showPopover
                ? { background: "#ccc" }
                : undefined),
              display: "flex",
            }}
            onClick={() => {
              setShowPopover(!showPopover);
            }}
          >
            <div style={{ width: "25px" }}>
              {project_id && kernelName ? (
                <Logo
                  kernel={kernelName}
                  size={18}
                  style={{ marginTop: "-2px" }}
                />
              ) : (
                <Icon
                  name={"jupyter"}
                  style={{
                    marginTop: "4px",
                    fontSize: "16px",
                    color: "#666",
                  }}
                />
              )}
            </div>
            <div
              style={{
                textOverflow: "ellipsis",
                overflowX: "hidden",
                width: "100px",
                textAlign: "left",
              }}
            >
              {kernelName ? (
                kernelDisplayName(kernelName, project_id)
              ) : (
                <span style={{ color: "#999" }}>Kernel...</span>
              )}
            </div>
          </Button>
        </Tooltip>
      </Popover>
      {/*hasOpenAI && (
          <Button>
            <OpenAIAvatar
              size={16}
              style={{ marginRight: "5px" }}
              innerStyle={{ top: "3.5px" }}
            />
            Explain
          </Button>
        )*/}
    </div>
  );
}

type GetFromCache = (hash: string) => Promise<{
  output?: object[];
  created?: Date;
}>;

const getFromDatabaseCache: GetFromCache = reuseInFlight(
  async (hash) => await api("execute", { hash }),
);

/*
Show the serial port output for a specific compute server in a project
that user collaborates on.

Autorefresh exponential backoff algorithm:

- when not enabled, obviously do nothing
- when enabled refresh in MIN_INTERVAL_MS.
   - if there is a change, refresh again in MIN_INTERVAL_MS
   - if there is no change, refresh in cur*EXPONENTIAL_BACKOFF seconds,
     up to MAX_INTERVAL_MS.
*/

const MIN_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 45000;
const EXPONENTIAL_BACKOFF = 1.3;

import { Button, Checkbox, Modal, Spin, Tooltip } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Terminal } from "@xterm/xterm";

import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { getSerialPortOutput } from "./api";

import { setTheme } from "@cocalc/frontend/frame-editors/terminal-editor/themes";
import { CancelText } from "@cocalc/frontend/i18n/components";

const WIDTH = 160;
const HEIGHT = 40;

export default function SerialPortOutput({
  id,
  style,
  title = "",
}: {
  id: number;
  style?;
  title?: string;
  color?: string;
}) {
  const [show, setShow] = useState<boolean>(false);

  return (
    <>
      <Tooltip title={"Show output of the serial port (boot messages, etc.)"}>
        <Button
          size={"small"}
          type="text"
          style={{ color: "#666", ...style }}
          onClick={() => setShow(!show)}
        >
          <Icon name="laptop" />
        </Button>
        {show && (
          <SerialLogModal id={id} title={title} close={() => setShow(false)} />
        )}
      </Tooltip>
    </>
  );
}

export function SerialLogModal({ id, title, close }) {
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const termRef = useRef<any>(null);
  const eltRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);
  const timeoutMsRef = useRef<number>(MIN_INTERVAL_MS);
  const lastOutputRef = useRef<string>("");

  const clearTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const updateRefresh = useCallback(async () => {
    clearTimeout();
    const before = lastOutputRef.current;
    await update();
    timeoutRef.current = setTimeout(updateRefresh, timeoutMsRef.current);
    if (before == lastOutputRef.current) {
      timeoutMsRef.current = Math.min(
        timeoutMsRef.current * EXPONENTIAL_BACKOFF,
        MAX_INTERVAL_MS,
      );
    }
  }, []);

  useEffect(() => {
    // get it started
    updateRefresh();

    // clear timeout on unmount
    return clearTimeout;
  }, []);

  const update = async () => {
    if (loading) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const output = await getSerialPortOutput(id);
      lastOutputRef.current = output;
      if (termRef.current == null) {
        const elt = ReactDOM.findDOMNode(eltRef.current) as any;
        if (elt != null) {
          const settings =
            redux.getStore("account").get("terminal")?.toJS() ?? {};
          const { color_scheme } = settings;
          const term = new Terminal({
            fontSize: 13,
            fontFamily: "monospace",
            scrollback: 1000000,
          });
          termRef.current = term;
          setTheme(term, color_scheme);
          term.resize(WIDTH, HEIGHT);
          term.open(elt);
        }
      }
      termRef.current?.write(output);
      termRef.current?.scrollToBottom();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    update();
  }, []);

  return (
    <Modal
      width={`${WIDTH + 20}ex`}
      title={
        <>
          <Icon name="laptop" style={{ marginRight: "15px" }} /> Serial Port
          Output - "{title}"
        </>
      }
      open
      onCancel={close}
      footer={[
        <Checkbox
          checked={autoRefresh}
          onChange={() => {
            if (autoRefresh) {
              clearTimeout();
            } else {
              timeoutMsRef.current = MIN_INTERVAL_MS;
              updateRefresh();
            }
            setAutoRefresh(!autoRefresh);
          }}
          key="auto-refresh"
          style={{ float: "left" }}
        >
          Auto Refresh
        </Checkbox>,
        <Button key="cancel" onClick={close}>
          <CancelText />
        </Button>,
        <Button
          key="refresh"
          onClick={() => {
            if (autoRefresh) {
              clearTimeout();
              timeoutMsRef.current = MIN_INTERVAL_MS;
              updateRefresh();
            } else {
              update();
            }
          }}
          disabled={loading}
        >
          <Icon name="refresh" /> Refresh
          {loading && <Spin style={{ marginLeft: "15px" }} />}
        </Button>,
        <Button
          key="top"
          onClick={() => {
            termRef.current?.scrollToTop();
          }}
        >
          <Icon name="arrow-up" /> Top
        </Button>,
        <Button
          key="bottom"
          onClick={() => {
            termRef.current?.scrollToBottom();
          }}
        >
          <Icon name="arrow-down" /> Bottom
        </Button>,
        <Button key="ok" type="primary" onClick={close}>
          OK
        </Button>,
      ]}
    >
      {error && <ShowError error={error} setError={setError} />}
      <div
        style={{
          overflow: "auto",
          maxHeight: "70vh",
        }}
      >
        <pre
          ref={eltRef}
          style={{
            width: `${WIDTH + 20}ex`,
            padding: 0,
          }}
        ></pre>
      </div>
    </Modal>
  );
}

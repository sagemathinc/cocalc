/*
Show the serial port output for a specific compute server in a project
that user collaborates on.
*/

import { Modal, Button, Spin, Tooltip } from "antd";
import { useRef, useState } from "react";
import ReactDOM from "react-dom";
import { getSerialPortOutput } from "./api";
import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { Terminal } from "xterm";
import { setTheme } from "@cocalc/frontend/frame-editors/terminal-editor/themes";

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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const termRef = useRef<any>(null);
  const eltRef = useRef<any>(null);

  const update = async () => {
    if (loading) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const output = await getSerialPortOutput(id);
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

  return (
    <>
      <Tooltip title={"Show output of the serial port (boot messages, etc.)"}>
        <Button
          size={"small"}
          type="text"
          style={{ color: "#666", ...style }}
          onClick={async () => {
            setShow(!show);
            if (!show) {
              // showing serial port output, so update it.
              update();
            }
          }}
        >
          <Icon name="laptop" /> Serial
        </Button>
      </Tooltip>
      <Modal
        width={`${WIDTH + 20}ex`}
        title={
          <>
            <Icon name="laptop" style={{ marginRight: "15px" }} /> Serial Port
            Output - "{title}"
          </>
        }
        open={show}
        onCancel={() => {
          setShow(false);
        }}
        footer={[
          <Button key="refresh" onClick={update} disabled={loading}>
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
          <Button
            key="ok"
            type="primary"
            onClick={() => {
              setShow(false);
            }}
          >
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
    </>
  );
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useTypedRedux, CSS } from "../../app-framework";
import { delay } from "awaiting";
import { webapp_client } from "../../webapp-client";
import { Button, Alert, Typography, Row, Col } from "antd";
import { register_file_editor } from "../../frame-editors/frame-tree/register";
import { filename_extension_notilde } from "smc-util/misc";
import { Loading } from "../../r_misc";
import { Editor as CodeEditor } from "../../frame-editors/code-editor/editor";
import { Actions as CodeEditorActions } from "../../frame-editors/code-editor/actions";

const STYLE: CSS = {
  margin: "0 auto",
  padding: "20px",
  overflow: "auto",
  maxWidth: "1000px",
};

interface Props {
  path: string;
  project_id: string;
}

async function get_mime({ project_id, path, set_mime, set_err, set_snippet }) {
  try {
    let mime = "";
    const {
      stdout: mime_raw,
      exit_code: exit_code1,
    } = await webapp_client.project_client.exec({
      project_id,
      command: "file",
      args: ["-b", "--mime-type", path],
    });
    if (exit_code1 != 0) {
      set_err(`Error: exit_code1 = ${exit_code1}`);
    } else {
      mime = mime_raw.split("\n")[0].trim();
      set_mime(mime);
    }

    const is_binary = !mime.startsWith("text/");
    const content_cmd = is_binary
      ? {
          command: "head",
          args: ["-n", "-20", "-c", "2000", path],
        }
      : {
          command: "hexdump",
          args: ["-C", "-n", "512", path],
        };

    // limit number of lines and bytes – it could be a "one-line" monster file
    const {
      stdout: raw,
      exit_code: exit_code2,
    } = await webapp_client.project_client.exec({ project_id, ...content_cmd });
    if (exit_code2 != 0) {
      set_err(`Error: exit_code2 = ${exit_code2}`);
    } else {
      if (is_binary) {
        set_snippet(raw);
      } else {
        set_snippet(
          // 80 char line break and limit overall length
          raw
            .trim()
            .slice(0, 20 * 80)
            .split(/(.{0,80})/g)
            .filter((x) => !!x)
            .join("\n")
        );
      }
    }
  } catch (err) {
    set_err(err.toString());
  }
}

export const UnknownEditor: React.FC<Props> = (props: Props) => {
  const { path, project_id } = props;
  const ext = filename_extension_notilde(path).toLowerCase();
  const NAME = useTypedRedux("customize", "site_name");
  const actions = useActions({ project_id });
  const [mime, set_mime] = React.useState("");
  const [err, set_err] = React.useState("");
  const [snippet, set_snippet] = React.useState("");

  React.useEffect(() => {
    if (mime) return;
    get_mime({ project_id, path, set_mime, set_err, set_snippet });
  }, []);

  const explanation = React.useMemo(() => {
    if (mime == "inode/x-empty") {
      return (
        <span>
          This file is empty and has the unknown file-extension:{" "}
          <Typography.Text strong>
            <code>*.{ext}</code>
          </Typography.Text>
          .
        </span>
      );
    } else if (mime.startsWith("text/")) {
      return (
        <span>
          This file could contain plain text, but the file-extension:{" "}
          <Typography.Text strong>
            <code>*.{ext}</code>
          </Typography.Text>{" "}
          is unknown. Try the Code Editor!
        </span>
      );
    } else {
      return (
        <span>
          This is likely a binary file and the file-extension:{" "}
          <code>{ext}</code> is unknown. Most likely, you have to open this file
          via a library/package in a programming environment, like a Jupyter
          Notebook.
        </span>
      );
    }
  }, [mime]);

  async function register(ext, editor: "code") {
    switch (editor) {
      case "code":
        register_file_editor({
          ext: [ext],
          component: CodeEditor,
          Actions: CodeEditorActions,
        });
        break;
      default:
        console.warn(`Unknown editor of type ${editor}, aborting.`);
        return;
    }
    if (actions == null) {
      console.warn(
        `Project Actions for ${project_id} not available – shouldn't happen.`
      );
      return;
    }
    actions.close_file(path);
    await delay(0);
    actions.open_file({ path });
  }

  function render_header() {
    return <h1>Unknown file extension</h1>;
  }

  function render_info() {
    return (
      <div>
        {NAME} does not know what to do with this file, ending in{" "}
        <code>{ext}</code>. For this session, you can register on of the
        existing editors to open up this file.
      </div>
    );
  }

  function render_warning() {
    return (
      <Alert
        message="Warning"
        description="Opening binary files could possibly modify and hence damage them. If this happens, you can use Files → Backup to restore them."
        type="warning"
        showIcon
      />
    );
  }

  function render_register() {
    return (
      <>
        <div>
          {NAME} detected that the file's content has the MIME code{" "}
          <Typography.Text strong>
            <code>{mime}</code>
          </Typography.Text>
          . {explanation}
        </div>
        <div>The following editors are available:</div>
        <ul>
          <li>
            <Button onClick={() => register(ext, "code")}>
              Register{" "}
              <Typography.Text strong>
                <code>.{ext}</code>
              </Typography.Text>{" "}
              with the <code>Code Editor</code>
            </Button>
          </li>
        </ul>
        <div>
          <Typography.Text strong>Note:</Typography.Text> by clicking this
          button this file will open immediately. This will be remembered until
          you open up {NAME} again or refresh this page. Alternatively, rename
          this file's file extension.
        </div>
      </>
    );
  }

  function render_content() {
    if (!snippet) return;
    return (
      <>
        <div>The content of this file looks like that:</div>
        <div>
          <pre style={{ fontSize: "70%" }}>{snippet}</pre>
        </div>
      </>
    );
  }

  function render() {
    if (!mime) {
      return <Loading theme={"medium"} />;
    }
    return (
      <>
        <Col flex={1}>{render_header()}</Col>
        <Col flex={1}>{render_info()}</Col>
        <Col flex={1}>{render_warning()}</Col>
        <Col flex={1}>{render_register()}</Col>
        <Col flex={1}>{render_content()}</Col>
      </>
    );
  }

  if (err) {
    return (
      <div>
        Problem: <pre>{err}</pre>
      </div>
    );
  } else {
    return (
      <Row style={STYLE} gutter={[24, 24]}>
        {render()}
      </Row>
    );
  }
};

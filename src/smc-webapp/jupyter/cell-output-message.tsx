/*
Handling of output messages.

TODO: most components should instead be in separate files.
*/

declare const $: any;

const { Markdown, HTML } = require("../r_misc");
const Ansi = require("ansi-to-react");

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Button } from "react-bootstrap";
import * as immutable from "immutable";
import { Icon } from "../r_misc/icon";
import { IFrame } from "./cell-output-iframe";
import { get_blob_url } from "./server-urls";
import { javascript_eval } from "./javascript-eval";

import { delay } from "awaiting";
import { JupyterActions } from "./actions";

import { endswith, is_array, merge } from "smc-util/misc2";

const OUT_STYLE: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordWrap: "break-word",
  fontFamily: "monospace",
  paddingTop: "5px",
  paddingBottom: "5px",
  paddingLeft: "5px"
};

// const ANSI_STYLE: React.CSSProperties = OUT_STYLE;
const STDOUT_STYLE: React.CSSProperties = OUT_STYLE;
const STDERR_STYLE: React.CSSProperties = merge(
  { backgroundColor: "#fdd" },
  STDOUT_STYLE
);
const TRACEBACK_STYLE: React.CSSProperties = merge(
  { backgroundColor: "#f9f2f4" },
  OUT_STYLE
);

interface StdoutProps {
  message: immutable.Map<string, any>;
}

export class Stdout extends Component<StdoutProps> {
  shouldComponentUpdate(nextProps: StdoutProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render(): Rendered {
    const value = this.props.message.get("text");
    if (is_ansi(value)) {
      return (
        <div style={STDOUT_STYLE}>
          <Ansi>{value}</Ansi>
        </div>
      );
    }
    // This span below is solely to workaround an **ancient** Firefox bug
    // See https://github.com/sagemathinc/cocalc/issues/1958
    return (
      <div style={STDOUT_STYLE}>
        <span>{value}</span>
      </div>
    );
  }
}

interface StderrProps {
  message: immutable.Map<string, any>;
}

export class Stderr extends Component<StderrProps> {
  shouldComponentUpdate(nextProps: StderrProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render(): Rendered {
    const value = this.props.message.get("text");
    if (is_ansi(value)) {
      return (
        <div style={STDERR_STYLE}>
          <Ansi>{value}</Ansi>
        </div>
      );
    }
    // span -- see https://github.com/sagemathinc/cocalc/issues/1958
    return (
      <div style={STDERR_STYLE}>
        <span>{value}</span>
      </div>
    );
  }
}

interface ImageProps {
  type: string;
  sha1?: string; // one of sha1 or value should be given
  value?: string;
  project_id?: string;
  width?: number;
  height?: number;
}

interface ImageState {
  attempts: number;
}

class Image extends Component<ImageProps, ImageState> {
  private is_mounted: any; // TODO: dont do this

  constructor(props: ImageProps, context: any) {
    super(props, context);
    this.state = { attempts: 0 };
  }

  load_error = async (): Promise<void> => {
    if (this.state.attempts < 5 && this.is_mounted) {
      await delay(500);
      if (!this.is_mounted) return;
      this.setState({ attempts: this.state.attempts + 1 });
    }
  };

  componentDidMount(): void {
    this.is_mounted = true;
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
  }

  extension = (): string => {
    return this.props.type.split("/")[1].split("+")[0];
  };

  render_using_server(project_id: string, sha1: string): Rendered {
    const src =
      get_blob_url(project_id, this.extension(), sha1) +
      `&attempts=${this.state.attempts}`;
    return (
      <img
        src={src}
        onError={this.load_error}
        width={this.props.width}
        height={this.props.height}
      />
    );
  }

  encoding = (): string => {
    switch (this.props.type) {
      case "image/svg+xml":
        return "utf8";
      default:
        return "base64";
    }
  };

  render_locally(value: string): Rendered {
    // The encodeURIComponent is definitely necessary these days.
    // See https://github.com/sagemathinc/cocalc/issues/3197 and the comments at
    // https://css-tricks.com/probably-dont-base64-svg/
    const src = `data:${
      this.props.type
    };${this.encoding()},${encodeURIComponent(value)}`;
    return (
      <img src={src} width={this.props.width} height={this.props.height} />
    );
  }

  render(): Rendered {
    if (this.props.value != null) {
      return this.render_locally(this.props.value);
    } else if (this.props.sha1 != null && this.props.project_id != null) {
      return this.render_using_server(this.props.project_id, this.props.sha1);
    } else {
      // not enough info to render
      return <span>[unavailable {this.extension()} image]</span>;
    }
  }
}

interface TextPlainProps {
  value: string;
}

class TextPlain extends Component<TextPlainProps> {
  render() {
    // span? -- see https://github.com/sagemathinc/cocalc/issues/1958
    return (
      <div style={STDOUT_STYLE}>
        <span>{this.props.value}</span>
      </div>
    );
  }
}

interface UntrustedJavascriptProps {
  value: any; // TODO: not used?
}

class UntrustedJavascript extends Component<UntrustedJavascriptProps> {
  render() {
    return (
      <span style={{ color: "#888" }}>(not running untrusted Javascript)</span>
    );
  }
}

interface JavascriptProps {
  value: string | immutable.List<string>;
}

class Javascript extends Component<JavascriptProps> {
  private node: HTMLElement;

  componentDidMount(): void {
    const element = $(this.node);
    element.empty();
    let value: string[];
    if (typeof this.props.value == "string") {
      value = [this.props.value];
    } else {
      const x = this.props.value.toJS();
      if (!is_array(x)) {
        console.warn("not evaluating javascript since wrong type:", x);
        return;
      } else {
        value = x;
      }
    }
    let block: string;
    for (block of value) {
      javascript_eval(block, element);
    }
  }

  render(): Rendered {
    return <div />;
  }
}

interface PDFProps {
  project_id: string;
  value: string | immutable.Map<string, any>;
}

class PDF extends Component<PDFProps> {
  render(): Rendered {
    let href: string;
    if (typeof this.props.value == "string") {
      href = get_blob_url(this.props.project_id, "pdf", this.props.value);
    } else {
      href = `data:application/pdf;base64,${this.props.value.get("value")}`;
    }
    return (
      <div style={OUT_STYLE}>
        <a
          href={href}
          target="_blank"
          style={{ cursor: "pointer" }}
          rel="noopener"
        >
          View PDF
        </a>
      </div>
    );
  }
}

interface DataProps {
  message: immutable.Map<string, any>;
  project_id?: string;
  directory?: string;
  id?: string;
  actions?: JupyterActions;
  trust?: boolean;
}

class Data extends Component<DataProps> {
  shouldComponentUpdate(nextProps): boolean {
    return (
      !this.props.message.equals(nextProps.message) ||
      this.props.id != nextProps.id ||
      this.props.trust != nextProps.trust
    );
  }

  render_html(value: string): Rendered {
    return (
      <div>
        <HTML
          value={value}
          auto_render_math={true}
          project_id={this.props.project_id}
          file_path={this.props.directory}
          safeHTML={!this.props.trust}
        />
      </div>
    );
  }

  render_markdown(value: string): Rendered {
    return (
      <div>
        <Markdown
          value={value}
          project_id={this.props.project_id}
          file_path={this.props.directory}
          safeHTML={!this.props.trust}
          checkboxes={true}
        />
      </div>
    );
  }

  render(): Rendered {
    const data = this.props.message.get("data");
    if (data == null || typeof data.forEach != "function") return;

    let type: string = "";
    let value: any = undefined;
    data.forEach(function(v, k) {
      type = k;
      value = v;
      return false;
    });

    if (type != "") {
      const [a, b] = type.split("/");
      switch (a) {
        case "text":
          switch (b) {
            case "plain":
              if (is_ansi(value)) {
                return (
                  <div style={STDOUT_STYLE}>
                    <Ansi>{value}</Ansi>
                  </div>
                );
              }
              return <TextPlain value={value} />;

            case "html":
            case "latex": // put latex as HTML, since jupyter requires $'s anyways.
              return this.render_html(value);

            case "markdown":
              return this.render_markdown(value);
          }
          break;

        case "image":
          let height: any;
          let width: any;
          this.props.message
            .get("metadata", [])
            .forEach((value: any, key: any) => {
              if (key === "width") {
                width = value;
              } else if (key === "height") {
                height = value;
              } else {
                // sometimes metadata is e.g., "image/png":{width:, height:}
                if (value && value.forEach) {
                  value.forEach((value: any, key: any) => {
                    if (key === "width") {
                      return (width = value);
                    } else if (key === "height") {
                      return (height = value);
                    }
                  });
                }
              }
            });
          return (
            <Image
              project_id={this.props.project_id}
              type={type}
              sha1={typeof value === "string" ? value : undefined}
              value={typeof value === "object" ? value.get("value") : undefined}
              width={width}
              height={height}
            />
          );

        case "iframe":
          return <IFrame sha1={value} project_id={this.props.project_id} />;

        case "application":
          switch (b) {
            case "javascript":
              if (this.props.trust) {
                return <Javascript value={value} />;
              }
              return <UntrustedJavascript value={value} />;

            case "pdf":
              if (this.props.project_id == null || value == null) {
                console.warn("PDF: project_id and value must be specified");
                return <pre>Invalid PDF output</pre>
              }
              return <PDF value={value} project_id={this.props.project_id} />;
          }
          break;
      }
    }

    return (
      <pre>
        Unsupported message: {JSON.stringify(this.props.message.toJS())}
      </pre>
    );
  }
}

interface TracebackProps {
  message: immutable.Map<string, any>;
}

class Traceback extends Component<TracebackProps> {
  shouldComponentUpdate(nextProps: TracebackProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render(): Rendered {
    const v: Rendered[] = [];
    let n: number = 0;

    this.props.message.get("traceback").forEach(function(x) {
      if (!endswith(x, "\n")) {
        x += "\n";
      }
      v.push(<Ansi key={n}>{x}</Ansi>);
      n += 1;
    });

    return <div style={TRACEBACK_STYLE}>{v}</div>;
  }
}

interface MoreOutputProps {
  message: immutable.Map<string, any>;
  id: string;
  actions?: JupyterActions; // if not set, then can't get more output
}

class MoreOutput extends Component<MoreOutputProps> {
  shouldComponentUpdate(nextProps: MoreOutputProps) {
    return (
      nextProps.message !== this.props.message || nextProps.id != this.props.id
    );
  }

  show_more_output = (): void => {
    this.props.actions != null
      ? this.props.actions.fetch_more_output(this.props.id)
      : undefined;
  };

  render(): Rendered {
    if (this.props.actions == null || this.props.message.get("expired")) {
      return (
        <Button bsStyle="info" disabled>
          <Icon name="eye-slash" /> Additional output not available
        </Button>
      );
    } else {
      return (
        <Button onClick={this.show_more_output} bsStyle="info">
          <Icon name="eye" /> Fetch additional output...
        </Button>
      );
    }
  }
}

const INPUT_STYLE: React.CSSProperties = {
  padding: "0em 0.25em",
  margin: "0em 0.25em"
};

interface InputDoneProps {
  message: immutable.Map<string, any>;
}

class InputDone extends Component<InputDoneProps> {
  render(): Rendered {
    const value: string = this.props.message.getIn(["opts", "prompt"], "");
    return (
      <div style={STDOUT_STYLE}>
        {value}
        <input
          style={INPUT_STYLE}
          type={
            this.props.message.getIn(["opts", "password"]) ? "password" : "text"
          }
          size={Math.max(47, value.length + 10)}
          readOnly={true}
          value={this.props.message.get("value", "")}
        />
      </div>
    );
  }
}

interface InputProps {
  message: immutable.Map<string, any>;
  actions?: JupyterActions;
  id: string;
}

interface InputState {
  value: string;
}

class Input extends Component<InputProps, InputState> {
  constructor(props: InputProps, context: any) {
    super(props, context);
    this.state = { value: "" };
  }

  key_down = async (evt: React.KeyboardEvent): Promise<void> => {
    if (evt.keyCode === 13) {
      evt.stopPropagation();
      this.submit();
    }
    // Official docs: If the user hits EOF (*nix: Ctrl-D, Windows: Ctrl-Z+Return),
    // raise EOFError.
    // The Jupyter notebook does *NOT* properly implement this.  We do
    // something at least similar and send an interrupt on
    // control d or control z.
    if ((evt.keyCode === 68 || evt.keyCode === 90) && evt.ctrlKey) {
      evt.stopPropagation();
      if (this.props.actions != null) {
        this.props.actions.signal("SIGINT");
      }
      await delay(10);
      this.submit();
    }
  };

  submit = (): void => {
    if (this.props.actions == null) return;
    this.props.actions.submit_input(this.props.id, this.state.value);
    this.props.actions.focus_unlock();
  };

  render(): Rendered {
    return (
      <div style={STDOUT_STYLE}>
        {this.props.message.getIn(["opts", "prompt"], "")}
        <input
          style={INPUT_STYLE}
          autoFocus={true}
          readOnly={this.props.actions == null}
          type={
            this.props.message.getIn(["opts", "password"]) ? "password" : "text"
          }
          ref="input"
          size={Math.max(47, this.state.value.length + 10)}
          value={this.state.value}
          onChange={(e: any) => this.setState({ value: e.target.value })}
          onBlur={
            this.props.actions != null
              ? this.props.actions.focus_unlock
              : undefined
          }
          onFocus={
            this.props.actions != null
              ? this.props.actions.blur_lock
              : undefined
          }
          onKeyDown={this.key_down}
        />
      </div>
    );
  }
}

interface NotImplementedProps {
  message: immutable.Map<string, any>;
}

class NotImplemented extends Component<NotImplementedProps> {
  shouldComponentUpdate(nextProps: NotImplementedProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render() {
    return (
      <pre style={STDERR_STYLE}>
        {JSON.stringify(this.props.message.toJS())}
      </pre>
    );
  }
}

function message_component(message: immutable.Map<string, any>): any {
  if (message.get("more_output") != null) {
    return MoreOutput;
  }
  if (message.get("name") === "stdout") {
    return Stdout;
  }
  if (message.get("name") === "stderr") {
    return Stderr;
  }
  if (message.get("name") === "input") {
    if (message.get("value") != null) {
      return InputDone;
    } else {
      return Input;
    }
  }
  if (message.get("data") != null) {
    return Data;
  }
  if (message.get("traceback") != null) {
    return Traceback;
  }
  return NotImplemented;
}

interface CellOutputMessageProps {
  message: immutable.Map<string, any>;
  project_id?: string;
  directory?: string;
  actions?: JupyterActions; // optional  - not needed by most messages
  id?: string; // optional, and not usually needed either
  trust?: boolean; // is notebook trusted by the user (if not won't eval javascript)
}

export class CellOutputMessage extends Component<CellOutputMessageProps> {
  render() {
    const C: any = message_component(this.props.message);
    return (
      <C
        message={this.props.message}
        project_id={this.props.project_id}
        directory={this.props.directory}
        actions={this.props.actions}
        trust={this.props.trust}
        id={this.props.id}
      />
    );
  }
}

const OUTPUT_STYLE: React.CSSProperties = {
  flex: 1,
  overflowX: "auto",
  lineHeight: "normal",
  backgroundColor: "#fff",
  border: 0,
  marginBottom: 0,
  marginLeft: "1px"
};

const OUTPUT_STYLE_SCROLLED = merge({ maxHeight: "40vh" }, OUTPUT_STYLE);

interface CellOutputMessagesProps {
  actions?: any; // optional actions
  output: immutable.Map<string, any>; // the actual messages
  project_id?: string;
  directory?: string;
  scrolled?: boolean;
  trust?: boolean;
  id?: string;
}

export class CellOutputMessages extends Component<CellOutputMessagesProps> {
  shouldComponentUpdate(nextProps): boolean {
    return (
      !nextProps.output.equals(this.props.output) ||
      nextProps.scrolled !== this.props.scrolled ||
      nextProps.trust !== this.props.trust
    );
  }

  render_output_message(n: string, mesg: immutable.Map<string, any>): Rendered {
    return (
      <CellOutputMessage
        key={n}
        message={mesg}
        project_id={this.props.project_id}
        directory={this.props.directory}
        actions={this.props.actions}
        trust={this.props.trust}
        id={this.props.id}
      />
    );
  }

  message_list = (): immutable.Map<string, any>[] => {
    const v: any[] = [];
    let k = 0;
    // TODO: use caching to make this more efficient...
    for (
      let n = 0, end = this.props.output.size, asc = 0 <= end;
      asc ? n < end : n > end;
      asc ? n++ : n--
    ) {
      const mesg = this.props.output.get(`${n}`);
      // Make this renderer robust against any possible weird shape of the actual
      // output object, e.g., undefined or not immmutable js.
      // Also, we're checking that get is defined --
      //   see https://github.com/sagemathinc/cocalc/issues/2404
      if (mesg == null || typeof mesg.get != "function") {
        console.warn(`Jupyter -- ignoring invalid mesg ${mesg}`);
        continue;
      }
      const name = mesg.get("name");
      if (
        k > 0 &&
        (name === "stdout" || name === "stderr") &&
        v[k - 1].get("name") === name
      ) {
        // combine adjacent stdout / stderr messages...
        v[k - 1] = v[k - 1].set(
          "text",
          v[k - 1].get("text") + mesg.get("text")
        );
      } else {
        v[k] = mesg;
        k += 1;
      }
    }
    return v;
  };

  render(): Rendered {
    // (yes, I know n is a string in the next line, but that's fine since it is used only as a key)
    const v: Rendered[] = [];
    const object: immutable.Map<string, any>[] = this.message_list();
    let n: string;
    for (n in object) {
      const mesg = object[n];
      if (mesg != null) {
        v.push(this.render_output_message(n, mesg));
      }
    }
    return (
      <div
        style={this.props.scrolled ? OUTPUT_STYLE_SCROLLED : OUTPUT_STYLE}
        className="cocalc-jupyter-rendered"
      >
        {v}
      </div>
    );
  }
}

function is_ansi(s?: string): boolean {
  return s != null && s.indexOf("\u001b") !== -1;
}

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Handling of output messages.

TODO: most components should instead be in separate files.
*/

declare const $: any;

import { React, Component } from "../app-framework"; // TODO: this will move
import { Button } from "react-bootstrap";
import * as immutable from "immutable";
const misc = require("smc-util/misc");
const { Icon, Markdown, HTML } = require("../r_misc");
// const { sanitize_html } = require("../misc_page");
const Ansi = require("ansi-to-react");
const { IFrame } = require("./cell-output-iframe");
const { get_blob_url } = require("./server-urls");
const { javascript_eval } = require("./javascript-eval");
const { is_redux, is_redux_actions } = require("../app-framework");

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
const STDERR_STYLE: React.CSSProperties = misc.merge(
  { backgroundColor: "#fdd" },
  STDOUT_STYLE
);
const TRACEBACK_STYLE: React.CSSProperties = misc.merge(
  { backgroundColor: "#f9f2f4" },
  OUT_STYLE
);

interface StdoutProps {
  message: immutable.Map<any, any>;
}

export class Stdout extends Component<StdoutProps> {
  shouldComponentUpdate(nextProps) {
    return !immutable_equals(this.props, nextProps);
  }

  render() {
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
  message: immutable.Map<any, any>;
}

export class Stderr extends Component<StderrProps> {
  shouldComponentUpdate(nextProps) {
    return !immutable_equals(this.props, nextProps);
  }
  render() {
    const value = this.props.message.get("text");
    if (is_ansi(value)) {
      return (
        <div style={STDERR_STYLE}>
          <Ansi>{value}</Ansi>
        </div>
      );
    }
    // span below?  what? -- See https://github.com/sagemathinc/cocalc/issues/1958
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
  private _is_mounted: any; // TODO: dont do this

  constructor(props: ImageProps, context: any) {
    super(props, context);
    this.state = { attempts: 0 };
  }

  load_error = () => {
    if (this.state.attempts < 5 && this._is_mounted) {
      const f = () => {
        if (this._is_mounted) {
          return this.setState({ attempts: this.state.attempts + 1 });
        }
      };
      return setTimeout(f, 500);
    }
  };

  componentDidMount() {
    return (this._is_mounted = true);
  }

  componentWillUnmount() {
    return (this._is_mounted = false);
  }

  extension = () => {
    return this.props.type.split("/")[1].split("+")[0];
  };

  render_using_server() {
    const src =
      get_blob_url(this.props.project_id, this.extension(), this.props.sha1) +
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

  encoding = () => {
    switch (this.props.type) {
      case "image/svg+xml":
        return "utf8";
      default:
        return "base64";
    }
  };

  render_locally() {
    if (this.props.value == null) {
      // should never happen
      return <span />;
    }
    // The encodeURIComponent is definitely necessary these days.
    // See https://github.com/sagemathinc/cocalc/issues/3197 and the comments at
    // https://css-tricks.com/probably-dont-base64-svg/
    const src = `data:${
      this.props.type
    };${this.encoding()},${encodeURIComponent(this.props.value)}`;
    return (
      <img src={src} width={this.props.width} height={this.props.height} />
    );
  }

  render() {
    if (this.props.value != null) {
      return this.render_locally();
    } else if (this.props.sha1 != null && this.props.project_id != null) {
      return this.render_using_server();
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
    // span?  what? -- See https://github.com/sagemathinc/cocalc/issues/1958
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
  value: any | string; // TODO: not used?
}

class Javascript extends Component<JavascriptProps> {
  private node: HTMLElement;
  componentDidMount() {
    const element = $(this.node);
    element.empty();
    let { value } = this.props;
    if (typeof value !== "string") {
      value = value.toJS();
    }
    if (!misc.is_array(value)) {
      value = [value];
    }
    return value.map(line => javascript_eval(line, element));
  }

  render() {
    return <div ref={(node: any) => (this.node = node)} />;
  }
}

interface PDFProps {
  project_id?: string;
  value: any | string;
}

class PDF extends Component<PDFProps> {
  render() {
    let href;
    if (misc.is_string(this.props.value)) {
      href = get_blob_url(this.props.project_id, "pdf", this.props.value);
    } else {
      const value = this.props.value.get("value");
      href = `data:application/pdf;base64,${value}`;
    }
    return (
      <div style={OUT_STYLE}>
        <a href={href} target="_blank" style={{ cursor: "pointer" }}>
          View PDF
        </a>
      </div>
    );
  }
}

interface DataProps {
  message: immutable.Map<any, any>;
  project_id?: string;
  directory?: string;
  id?: string;
  actions?: any;
  trust?: boolean;
}

class Data extends Component<DataProps> {
  shouldComponentUpdate(nextProps) {
    return !immutable_equals(this.props, nextProps);
  }
  render_html(value: any) {
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
  render_markdown(value: any) {
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
  render() {
    let type: any = undefined;
    let value: any = undefined;
    const data = this.props.message.get("data");
    __guardMethod__(data, "forEach", o =>
      o.forEach(function(v, k) {
        type = k;
        value = v;
        return false;
      })
    );
    if (type) {
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
  message: immutable.Map<any, any>;
}

class Traceback extends Component<TracebackProps> {
  shouldComponentUpdate(nextProps) {
    return !immutable_equals(this.props, nextProps);
  }
  render() {
    const v: any[] = [];
    let n = 0;
    this.props.message.get("traceback").forEach(function(x) {
      if (!misc.endswith(x, "\n")) {
        x += "\n";
      }
      v.push(<Ansi key={n}>{x}</Ansi>);
      n += 1;
    });
    return <div style={TRACEBACK_STYLE}>{v}</div>;
  }
}

interface MoreOutputProps {
  message: immutable.Map<any, any>;
  actions?: any; // if not set, then can't get more ouput
  id: string;
}

class MoreOutput extends Component<MoreOutputProps> {
  shouldComponentUpdate(nextProps) {
    return nextProps.message !== this.props.message;
  }
  show_more_output = () => {
    return this.props.actions != null
      ? this.props.actions.fetch_more_output(this.props.id)
      : undefined;
  };
  render() {
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
  message: immutable.Map<any, any>;
}

class InputDone extends Component<InputDoneProps> {
  render() {
    let left: any;
    let left1: any;
    const value = (left = this.props.message.get("value")) != null ? left : "";
    return (
      <div style={STDOUT_STYLE}>
        {(left1 = this.props.message.getIn(["opts", "prompt"])) != null
          ? left1
          : ""}
        <input
          style={INPUT_STYLE}
          type={
            this.props.message.getIn(["opts", "password"]) ? "password" : "text"
          }
          size={Math.max(47, value.length + 10)}
          readOnly={true}
          value={value}
        />
      </div>
    );
  }
}

interface InputProps {
  message: immutable.Map<any, any>;
  actions?: any;
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

  key_down = (evt: any) => {
    if (evt.keyCode === 13) {
      evt.stopPropagation();
      this.submit();
    }
    // Official docs: If the user hits EOF (*nix: Ctrl-D, Windows: Ctrl-Z+Return), raise EOFError.
    // The Jupyter notebook does *NOT* properly implement this.  We do something at least similar
    // and send an interrupt on control d or control z.
    if ((evt.keyCode === 68 || evt.keyCode === 90) && evt.ctrlKey) {
      evt.stopPropagation();
      if (this.props.actions != null) {
        this.props.actions.signal("SIGINT");
      }
      return setTimeout(this.submit, 10);
    }
  };

  submit = () => {
    if (this.props.actions != null) {
      this.props.actions.submit_input(this.props.id, this.state.value);
    }
    return this.props.actions != null
      ? this.props.actions.focus_unlock()
      : undefined;
  };

  render() {
    let left: any;
    return (
      <div style={STDOUT_STYLE}>
        {(left = this.props.message.getIn(["opts", "prompt"])) != null
          ? left
          : ""}
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
  message: immutable.Map<any, any>;
}

class NotImplemented extends Component<NotImplementedProps> {
  shouldComponentUpdate(nextProps) {
    return !immutable_equals(this.props, nextProps);
  }
  render() {
    return (
      <pre style={STDERR_STYLE}>
        {JSON.stringify(this.props.message.toJS())}
      </pre>
    );
  }
}

const message_component = function(message: immutable.Map<any, any>) {
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
};

interface CellOutputMessageProps {
  message?: immutable.Map<any, any>;
  project_id?: string;
  directory?: string;
  actions?: any; // optional  - not needed by most messages
  id?: string; // optional, and not usually needed either
  trust?: boolean; // is notebook trusted by the user (if not won't eval javascript)
}

export class CellOutputMessage extends Component<CellOutputMessageProps> {
  render() {
    if (this.props.message == null) return;
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

const OUTPUT_STYLE_SCROLLED = misc.merge({ maxHeight: "40vh" }, OUTPUT_STYLE);

interface CellOutputMessagesProps {
  actions?: any; // optional actions
  output: immutable.Map<any, any>; // the actual messages
  project_id?: string;
  directory?: string;
  scrolled?: boolean;
  trust?: boolean;
  id?: string;
}

export class CellOutputMessages extends Component<CellOutputMessagesProps> {
  shouldComponentUpdate(nextProps) {
    return (
      nextProps.output !== this.props.output ||
      nextProps.scrolled !== this.props.scrolled ||
      nextProps.trust !== this.props.trust
    );
  }
  render_output_message(n: any, mesg: any) {
    if (mesg == null) {
      return;
    }
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
  message_list = () => {
    const v: any[] = [];
    let k = 0;
    // TODO: use caching to make this more efficient...
    for (
      let n = 0, end = this.props.output.size, asc = 0 <= end;
      asc ? n < end : n > end;
      asc ? n++ : n--
    ) {
      const mesg = this.props.output.get(`${n}`);
      // Make this renderer robust against any possible weird shap of the actual
      // output object, e.g., undefined or not immmutable js.
      // Also, we're checking that get is defined --
      //   see https://github.com/sagemathinc/cocalc/issues/2404
      if ((mesg != null ? mesg.get : undefined) == null) {
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
  render() {
    // (yes, I know n is a string in the next line, but that's fine since it is used only as a key)
    const v = (() => {
      const result: any[] = [];
      const object = this.message_list();
      for (let n in object) {
        const mesg = object[n];
        result.push(this.render_output_message(n, mesg));
      }
      return result;
    })();
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
function is_ansi(s?: string) {
  return s != null && s.indexOf("\u001b") !== -1;
}

// TODO: this function came from "../r_misc" because it wasn't exported.
function immutable_equals(objA: any, objB: any) {
  if (immutable.is(objA, objB)) {
    return true;
  }
  const keysA = misc.keys(objA);
  const keysB = misc.keys(objB);
  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let key of keysA) {
    if (
      !objB.hasOwnProperty(key) ||
      !immutable_equals_single(objA[key], objB[key])
    ) {
      return false;
    }
  }
  return true;
}

// TODO: this function came from "../r_misc" because it wasn't exported.
// Checks whether two immutable variables (either ImmutableJS objects or actual
// immutable types) are equal. Gives a warning and returns false (no matter what) if either variable is mutable.
function immutable_equals_single(a: any, b: any) {
  if (typeof a === "object" || typeof b === "object") {
    if (
      (is_redux(a) && is_redux(b)) ||
      (is_redux_actions(a) && is_redux_actions(b))
    ) {
      return a === b;
    }
    // TODO: use immutable.isImmutable
    if (
      (immutable as any).Iterable.isIterable(a) &&
      (immutable as any).Iterable.isIterable(b)
    ) {
      return immutable.is(a, b);
    }
    if ((a != null && b == null) || (a == null && b != null)) {
      // if one is undefined and the other is defined, they aren't equal
      return false;
    }
    console.warn("Using mutable object in ImmutablePureRenderMixin:", a, b);
    return false;
  }
  return a === b;
}

function __guardMethod__(obj: any, methodName: any, transform: any) {
  if (
    typeof obj !== "undefined" &&
    obj !== null &&
    typeof obj[methodName] === "function"
  ) {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}

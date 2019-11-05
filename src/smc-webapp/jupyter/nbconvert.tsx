/*
NBConvert dialog -- for running nbconvert
*/
import { React, Component } from "../app-framework";
import * as immutable from "immutable";
const shell_escape = require("shell-escape");
const { Icon, Loading } = require("../r_misc");
const TimeAgo = require("react-timeago").default;
const { Button, ButtonGroup, Modal } = require("react-bootstrap");
const misc = require("smc-util/misc");
import { JupyterActions } from "./browser-actions";

const NAMES = {
  python: { ext: "py", display: "Python", internal: true },
  html: { ext: "html", display: "HTML" },
  markdown: { ext: "md", display: "Markdown", internal: true },
  rst: { ext: "rst", display: "reST", internal: true },
  asciidoc: { ext: "asciidoc", display: "AsciiDoc" },
  slides: { ext: "slides.html", display: "Slides" },
  latex: { ext: "tex", display: "LaTeX", internal: true },
  sagews: {
    ext: "sagews",
    display: "Sage Worksheet",
    internal: true,
    nolink: true
  },
  pdf: { ext: "pdf", display: "PDF" },
  script: { ext: "txt", display: "Executable Script", internal: true }
};

interface ErrorProps {
  actions: JupyterActions;
  nbconvert?: immutable.Map<string, any>;
}

class Error extends Component<ErrorProps> {
  private preNode: any;
  componentDidMount() {
    setTimeout(() => this.scroll(), 10); // TODO: cancel timeout in componentWillUnmount
  }

  componentDidUpdate(prev) {
    if (
      prev.nbconvert != null &&
      !misc.is_string(prev.nbconvert.get("error")) &&
      this.props.nbconvert != null &&
      misc.is_string(this.props.nbconvert.get("error"))
    ) {
      setTimeout(() => this.scroll(), 10);
    }
  }

  scroll = () => {
    const d = $(this.preNode);
    return d.scrollTop(d.prop("scrollHeight"));
  };

  render_time() {
    const time =
      this.props.nbconvert != null
        ? this.props.nbconvert.get("time")
        : undefined;
    if (time == null) {
      return;
    }
    return (
      <b>
        <TimeAgo title="" date={new Date(time)} minPeriod={5} />
      </b>
    );
  }

  render() {
    const error =
      this.props.nbconvert != null
        ? this.props.nbconvert.get("error")
        : undefined;
    if (!error) {
      return <span />;
    }
    if (!misc.is_string(error)) {
      this.props.actions.nbconvert_get_error();
      return <Loading />;
    } else {
      return (
        <span>
          <h3>Error</h3>
          Running nbconvert failed with an error {this.render_time()}. Read the
          error log below, update your Jupyter notebook, then try again.
          <pre
            ref={node => (this.preNode = node)}
            style={{ maxHeight: "40vh", margin: "5px 30px" }}
          >
            {error}
          </pre>
        </span>
      );
    }
  }
}

interface NBConvertProps {
  actions: any;
  path: string;
  project_id: string;
  nbconvert?: immutable.Map<any, any>;
  nbconvert_dialog?: immutable.Map<any, any>;
  backend_kernel_info?: immutable.Map<any, any>;
}

export class NBConvert extends Component<NBConvertProps> {
  close = () => {
    this.props.actions.setState({ nbconvert_dialog: undefined });
    return this.props.actions.focus(true);
  };

  render_edit(target_path: any) {
    return (
      <div>
        <br />
        <Button
          onClick={() => {
            this.props.actions.file_action("open_file", target_path);
            return this.close();
          }}
        >
          Edit exported file...
        </Button>
      </div>
    );
  }

  render_download() {
    if (
      this.props.nbconvert == null ||
      this.props.nbconvert.get("error") ||
      this.props.nbconvert_dialog == null
    ) {
      return;
    }
    const to = this.props.nbconvert_dialog.get("to");
    const info = NAMES[to];
    if (info == null) {
      return;
    }
    let ext: string;
    if (to === "script" && this.props.backend_kernel_info != null) {
      // special case where extension may be different
      ext = this.props.backend_kernel_info
        .getIn(["language_info", "file_extension"], "")
        .slice(1);
      if (ext === "") {
        ext = "txt";
      }
    } else {
      ext = info.ext;
    }
    const target_path = misc.change_filename_extension(this.props.path, ext);
    const url = this.props.actions.store.get_raw_link(target_path);
    return (
      <div style={{ fontSize: "14pt" }}>
        {!info.nolink ? (
          <a href={url} target="_blank">
            {target_path}
          </a>
        ) : (
          undefined
        )}
        {info.internal ? this.render_edit(target_path) : undefined}
      </div>
    );
  }

  render_result() {
    if (
      this.props.nbconvert != null
        ? this.props.nbconvert.get("error")
        : undefined
    ) {
      return (
        <Error actions={this.props.actions} nbconvert={this.props.nbconvert} />
      );
    }
  }

  render_recent_run() {
    let time =
      this.props.nbconvert != null
        ? this.props.nbconvert.get("time")
        : undefined;
    if (time == null) {
      return;
    }
    if (time < misc.server_minutes_ago(5)) {
      // only show if recent
      return;
    }
    if (
      !(this.props.nbconvert != null && this.props.nbconvert.has("args")
        ? this.props.nbconvert.get("args").equals(immutable.fromJS(this.args()))
        : undefined)
    ) {
      // Only show if same args.
      return;
    }
    time = (
      <b>
        <TimeAgo title="" date={new Date(time)} minPeriod={5} />
      </b>
    );
    return (
      <div style={{ marginTop: "15px" }}>
        Last exported {time}.{this.render_cmd()}
        {this.render_result()}
        <ButtonGroup>{this.render_download()}</ButtonGroup>
      </div>
    );
  }

  render_cmd() {
    // WARNING: this is just for looks; cmd is not what is literally run on the backend, though
    // it **should** be in theory.  But if you were to just change this, don't expect it to magically
    // change on the backend, as other code generates the cmd there. If this bugs you, refactor it!
    let cmd: any;
    const { tail = undefined } = misc.path_split(this.props.path) || {};
    if (
      this.props.nbconvert_dialog != null &&
      this.props.nbconvert_dialog.get("to") === "sagews"
    ) {
      cmd = shell_escape(["smc-ipynb2sagews", tail]);
    } else {
      const v = ["jupyter", "nbconvert"].concat(this.args());
      v.push("--");
      v.push(tail);
      cmd = shell_escape(v);
    }
    return <pre style={{ margin: "15px 0px", overflowX: "auto" }}>{cmd}</pre>;
  }

  render_started() {
    const start =
      this.props.nbconvert != null
        ? this.props.nbconvert.get("start")
        : undefined;
    if (start == null) {
      return;
    }
    return (
      <span>
        (started <TimeAgo title="" date={new Date(start)} minPeriod={1} />)
      </span>
    );
  }

  render_current() {
    if (this.props.nbconvert_dialog == null) {
      return;
    }
    const state =
      this.props.nbconvert != null
        ? this.props.nbconvert.get("state")
        : undefined;
    switch (state) {
      case "start":
        return (
          <div style={{ marginTop: "15px" }}>
            Requesting to run
            {this.render_cmd()}
          </div>
        );
      case "run":
        return (
          <div style={{ marginTop: "15px" }}>
            Running... {this.render_started()}
            {this.render_cmd()}
          </div>
        );
      case "done":
        return this.render_recent_run();
    }
  }

  args = () => {
    if (this.props.nbconvert_dialog == null) {
      return []; // broken case -- shouldn't happen
    }
    return ["--to", this.props.nbconvert_dialog.get("to")];
  };

  run = () => {
    return this.props.actions.nbconvert(this.args());
  };

  render_run_button() {
    if (this.props.nbconvert_dialog == null) {
      return;
    }
    const state =
      this.props.nbconvert != null
        ? this.props.nbconvert.get("state")
        : undefined;
    return (
      <div>
        <Button
          onClick={this.run}
          bsStyle="success"
          bsSize="large"
          disabled={["start", "run"].includes(state)}
        >
          Export to {this.target_name()}...
        </Button>
      </div>
    );
  }

  nbconvert_docs() {
    return (
      <a
        href="http://nbconvert.readthedocs.io/en/latest/usage.html"
        target="_blank"
        rel="noopener"
        className="pull-right"
      >
        <Icon name="external-link" /> nbconvert documentation
      </a>
    );
  }

  target_name = () => {
    const to =
      this.props.nbconvert_dialog != null
        ? this.props.nbconvert_dialog.get("to")
        : undefined;
    if (to != null) {
      return NAMES[to] != null ? NAMES[to].display : undefined;
    } else {
      return "";
    }
  };

  slides_command = () => {
    return `jupyter nbconvert --to slides --ServePostProcessor.port=18080 --ServePostProcessor.ip='*' --ServePostProcessor.open_in_browser=False ~/'${this.props.path}' --post serve`;
  };

  slides_url = () => {
    const base = misc.separate_file_extension(
      misc.path_split(this.props.path).tail
    ).name;
    const name = base + ".slides.html#/";
    return `https://cocalc.com/${this.props.project_id}/server/18080/` + name;
  };

  render_slides_workaround() {
    // workaround until #2569 is fixed.
    return (
      <Modal
        show={this.props.nbconvert_dialog != null}
        bsSize="large"
        onHide={this.close}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="slideshare" /> Jupyter Notebook Slideshow
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Use View-->Slideshow to turn your Jupyter notebook into a slideshow.
          One click display of slideshows is{" "}
          <a
            target="_blank"
            rel="noopener"
            href="https://github.com/sagemathinc/cocalc/issues/2569#issuecomment-350940928"
          >
            not yet implemented
          </a>
          . However, you can start a slideshow by copying and pasting the
          following command in a terminal in CoCalc (+New-->Terminal):
          <pre>{this.slides_command()}</pre>
          Then view your slides at
          <div style={{ textAlign: "center" }}>
            <a href={this.slides_url()} target="_blank">
              {this.slides_url()}
            </a>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  render() {
    const to =
      this.props.nbconvert_dialog != null
        ? this.props.nbconvert_dialog.get("to")
        : undefined;
    if (to == null) {
      return <span />;
    }
    if (to === "slides") {
      return this.render_slides_workaround();
    }
    return (
      <Modal
        show={this.props.nbconvert_dialog != null}
        bsSize="large"
        onHide={this.close}
      >
        <Modal.Header closeButton>
          <Modal.Title>Download</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {this.nbconvert_docs()}
          {this.render_run_button()}
          {this.render_current()}
        </Modal.Body>

        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

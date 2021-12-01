/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
NBConvert dialog -- for running nbconvert
*/
import { React, useRef } from "../app-framework";
import * as immutable from "immutable";
const shell_escape = require("shell-escape");
import { Icon, Loading, A } from "../components";
const TimeAgo = require("react-timeago").default;
const { Button, ButtonGroup, Modal } = require("react-bootstrap");
import * as misc from "@cocalc/util/misc";
import { JupyterActions } from "./browser-actions";

const NAMES = {
  python: { ext: "py", display: "Python", internal: true },
  "cocalc-html": { ext: "html", display: "HTML", no_run_button: true },
  "classic-html": { ext: "html", display: "HTML (Classic template)" },
  "lab-html": { ext: "html", display: "HTML (JupyterLab template)" },
  markdown: { ext: "md", display: "Markdown", internal: true },
  rst: { ext: "rst", display: "reST", internal: true },
  asciidoc: { ext: "asciidoc", display: "AsciiDoc" },
  slides: { ext: "slides.html", display: "Slides" },
  latex: { ext: "tex", display: "LaTeX", internal: true },
  sagews: {
    ext: "sagews",
    display: "Sage Worksheet",
    internal: true,
    nolink: true,
  },
  pdf: { ext: "pdf", display: "PDF via nbconvert and LaTeX" },
  webpdf: { ext: "pdf", display: "PDF via nbconvert webpdf" },
  script: { ext: "txt", display: "Executable Script", internal: true },
  "cocalc-pdf": { ext: "pdf", display: "PDF", no_run_button: true },
} as const;

interface ErrorProps {
  actions: JupyterActions;
  nbconvert?: immutable.Map<string, any>;
}

const Error: React.FC<ErrorProps> = (props: ErrorProps) => {
  const { actions, nbconvert } = props;
  const preNode = useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => scroll(), 10);
    return () => {
      clearTimeout(t);
    };
  }, []);

  React.useEffect(() => {
    if (nbconvert != null && misc.is_string(nbconvert.get("error"))) {
      const t = setTimeout(() => scroll(), 10);
      return () => {
        clearTimeout(t);
      };
    }
  }, [nbconvert?.get("error")]);

  function scroll(): void {
    if (preNode.current == null) return;
    const d = $(preNode.current);
    d.scrollTop(d.prop("scrollHeight"));
  }

  function render_time() {
    const time = nbconvert?.get("time");
    if (time == null) {
      return;
    }
    return (
      <b>
        <TimeAgo title="" date={new Date(time)} minPeriod={5} />
      </b>
    );
  }

  const error = nbconvert?.get("error");

  if (!error) {
    return <span />;
  }
  if (!misc.is_string(error)) {
    actions.nbconvert_get_error();
    return <Loading />;
  } else {
    return (
      <span>
        <h3>Error</h3>
        Running nbconvert failed with an error {render_time()}. Read the error
        log below, update your Jupyter notebook, then try again.
        <pre ref={preNode} style={{ maxHeight: "40vh", margin: "5px 30px" }}>
          {error}
        </pre>
      </span>
    );
  }
};

interface NBConvertProps {
  actions: any;
  path: string;
  project_id: string;
  nbconvert?: immutable.Map<any, any>;
  nbconvert_dialog?: immutable.Map<any, any>;
  backend_kernel_info?: immutable.Map<any, any>;
}

export const NBConvert: React.FC<NBConvertProps> = React.memo(
  (props: NBConvertProps) => {
    const {
      actions,
      path,
      project_id,
      nbconvert,
      nbconvert_dialog,
      backend_kernel_info,
    } = props;

    function close(): void {
      actions.setState({ nbconvert_dialog: undefined });
      actions.focus(true);
    }

    function render_edit(target_path: any) {
      return (
        <div>
          <br />
          <Button
            onClick={() => {
              actions.file_action("open_file", target_path);
              close();
            }}
          >
            Edit exported file...
          </Button>
        </div>
      );
    }

    function render_download() {
      if (
        nbconvert == null ||
        nbconvert.get("error") ||
        nbconvert_dialog == null
      ) {
        return;
      }
      const to = nbconvert_dialog.get("to");
      const info = NAMES[to];
      if (info == null) {
        return;
      }
      let ext: string;
      // --to script converts to a .py file
      if (to === "script" && backend_kernel_info != null) {
        // special case where extension may be different
        ext = backend_kernel_info
          .getIn(["language_info", "file_extension"], "")
          .slice(1);
        if (ext === "") {
          ext = "py";
        }
      } else {
        ext = info.ext;
      }
      const target_path = misc.change_filename_extension(path, ext);
      const url = actions.store.get_raw_link(target_path);
      return (
        <div style={{ fontSize: "14pt" }}>
          {!info.nolink ? <A href={url}>{target_path}</A> : undefined}
          {info.internal ? render_edit(target_path) : undefined}
        </div>
      );
    }

    function render_result() {
      if (nbconvert != null ? nbconvert.get("error") : undefined) {
        return <Error actions={actions} nbconvert={nbconvert} />;
      }
    }

    function render_recent_run() {
      let time = nbconvert != null ? nbconvert.get("time") : undefined;
      if (time == null) {
        return;
      }
      if (time < misc.server_minutes_ago(5)) {
        // only show if recent
        return;
      }
      if (
        !(nbconvert != null && nbconvert.has("args")
          ? nbconvert.get("args").equals(immutable.fromJS(args()))
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
          Last exported {time}. {render_cmd()}
          {render_result()}
          <ButtonGroup>{render_download()}</ButtonGroup>
        </div>
      );
    }

    function render_cmd() {
      // WARNING: this is just for looks; cmd is not what is literally run on the backend, though
      // it **should** be in theory.  But if you were to just change this, don't expect it to magically
      // change on the backend, as other code generates the cmd there. If this bugs you, refactor it!
      let cmd: any;
      const { tail = "" } = misc.path_split(path) || {};
      if (nbconvert_dialog != null && nbconvert_dialog.get("to") === "sagews") {
        cmd = shell_escape(["smc-ipynb2sagews", tail]);
      } else {
        const v = ["jupyter", "nbconvert"].concat(args());
        v.push("--");
        v.push(tail);
        cmd = shell_escape(v);
      }
      return <pre style={{ margin: "15px 0px", overflowX: "auto" }}>{cmd}</pre>;
    }

    function render_started() {
      const start = nbconvert != null ? nbconvert.get("start") : undefined;
      if (start == null) {
        return;
      }
      return (
        <span>
          (started <TimeAgo title="" date={new Date(start)} minPeriod={1} />)
        </span>
      );
    }

    function render_current() {
      if (nbconvert_dialog == null) {
        return;
      }
      const state = nbconvert != null ? nbconvert.get("state") : undefined;
      switch (state) {
        case "start":
          return (
            <div style={{ marginTop: "15px" }}>
              Requesting to run
              {render_cmd()}
            </div>
          );
        case "run":
          return (
            <div style={{ marginTop: "15px" }}>
              Running... {render_started()}
              {render_cmd()}
            </div>
          );
        case "done":
          return render_recent_run();
      }
    }

    function args(): string[] {
      if (nbconvert_dialog == null) {
        return []; // broken case -- shouldn't happen
      }
      const to = nbconvert_dialog.get("to");
      let v: string[];
      if (to == "classic-html") {
        v = ["--to", "html", "--template", "classic"];
      } else if (to == "lab-html") {
        v = ["--to", "html"]; // lab is the default
      } else if (to == "webpdf") {
        v = ["--to", "webpdf", "--allow-chromium-download"];
      } else {
        v = ["--to", to];
      }
      return v;
    }

    function run(): void {
      actions.nbconvert(args());
    }

    function render_run_button() {
      if (nbconvert_dialog == null) {
        return;
      }
      const to = nbconvert_dialog.get("to");
      const info = NAMES[to];
      if (info.no_run_button) return;
      const state = nbconvert != null ? nbconvert.get("state") : undefined;
      return (
        <div>
          <Button
            onClick={run}
            bsStyle="success"
            bsSize="large"
            disabled={["start", "run"].includes(state)}
          >
            Export to {target_name()}...
          </Button>
        </div>
      );
    }

    function nbconvert_docs() {
      return (
        <A href="http://nbconvert.readthedocs.io/en/latest/usage.html">
          <Icon name="external-link" /> nbconvert documentation
        </A>
      );
    }

    function target_name(): string | undefined {
      const to =
        nbconvert_dialog != null ? nbconvert_dialog.get("to") : undefined;
      if (to != null) {
        return NAMES[to] != null ? NAMES[to].display : undefined;
      } else {
        return "";
      }
    }

    function slides_command(): string {
      return `jupyter nbconvert --to slides --ServePostProcessor.port=18080 --ServePostProcessor.ip='*' --ServePostProcessor.open_in_browser=False ~/'${path}' --post serve`;
    }

    function slides_url(): string {
      const base = misc.separate_file_extension(
        misc.path_split(path).tail
      ).name;
      const name = base + ".slides.html#/";
      return `https://cocalc.com/${project_id}/server/18080/` + name;
    }

    function render_slides_workaround() {
      // workaround until #2569 is fixed.
      return (
        <Modal show={nbconvert_dialog != null} bsSize="large" onHide={close}>
          <Modal.Header closeButton>
            <Modal.Title>
              <Icon name="FundProjectionScreenOutlined" /> Jupyter Notebook
              Slideshow
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Use View &rarr; Slideshow to turn your Jupyter notebook into a
            slideshow. One click display of slideshows is{" "}
            <A href="https://github.com/sagemathinc/cocalc/issues/2569#issuecomment-350940928">
              not yet implemented
            </A>
            . However, you can start a slideshow by copying and pasting the
            following command in a terminal in CoCalc (+New &rarr; Terminal):
            <pre>{slides_command()}</pre>
            Then view your slides at
            <div style={{ textAlign: "center" }}>
              <A href={slides_url()}>{slides_url()}</A>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={close}>Close</Button>
          </Modal.Footer>
        </Modal>
      );
    }

    const to = nbconvert_dialog?.get("to");
    if (to == null) {
      return <span />;
    }
    if (to === "slides") {
      return render_slides_workaround();
    }
    return (
      <Modal show={nbconvert_dialog != null} bsSize="large" onHide={close}>
        <Modal.Header closeButton>
          <Modal.Title>Download</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {nbconvert_docs()}
          {render_run_button()}
          {render_current()}
        </Modal.Body>

        <Modal.Footer>
          <Button onClick={close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
);

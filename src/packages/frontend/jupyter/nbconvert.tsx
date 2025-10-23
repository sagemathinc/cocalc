/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
NBConvert dialog -- for running nbconvert
*/
import { Button, Modal } from "antd";
import * as immutable from "immutable";
import React, { useEffect, useRef } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { A, Icon, Loading, TimeAgo } from "@cocalc/frontend/components";
import * as misc from "@cocalc/util/misc";
import { JupyterActions } from "./browser-actions";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";

const NAMES = {
  python: { ext: "py", display: "Python", internal: true },
  "cocalc-html": {
    ext: "html",
    display: "HTML",
    no_run_button: true,
    estimate: 5,
  },
  "classic-html": {
    ext: "html",
    display: "HTML (Classic template)",
    estimate: 30,
  },
  "lab-html": {
    ext: "html",
    display: "HTML (JupyterLab template)",
    estimate: 30,
  },
  "classic-pdf": {
    ext: "pdf",
    display: "PDF (Classic template)",
    estimate: 45,
  },
  "lab-pdf": { ext: "pdf", display: "PDF (JupyterLab template)", estimate: 45 },
  markdown: { ext: "md", display: "Markdown", internal: true, estimate: 20 },
  rst: { ext: "rst", display: "reST", internal: true, estimate: 30 },
  asciidoc: { ext: "asciidoc", display: "AsciiDoc", estimate: 30 },
  slides: { ext: "slides.html", display: "Slides", estimate: 30 },
  latex: { ext: "tex", display: "LaTeX", internal: true, estimate: 45 },
  sagews: {
    ext: "sagews",
    display: "Sage Worksheet",
    internal: true,
    nolink: true,
    estimate: 10,
  },
  pdf: { ext: "pdf", display: "PDF via nbconvert and LaTeX", estimate: 45 },
  webpdf: { ext: "pdf", display: "PDF via nbconvert webpdf", estimate: 45 },
  script: {
    ext: "",
    display: "Executable Script",
    internal: true,
    estimate: 30,
  },
  "cocalc-pdf": {
    ext: "pdf",
    display: "PDF",
    no_run_button: true,
    estimate: 10,
  },
} as const;

interface ErrorProps {
  actions: JupyterActions;
  nbconvert?: immutable.Map<string, any>;
}

const Error: React.FC<ErrorProps> = (props: ErrorProps) => {
  const { nbconvert } = props;
  const preNode = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const t = setTimeout(() => scroll(), 10);
    return () => {
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
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
        <TimeAgo date={new Date(time)} />
      </b>
    );
  }

  const error = nbconvert?.get("error");

  if (!error) {
    return <span />;
  }
  if (!misc.is_string(error)) {
    return <Loading />;
  } else {
    return (
      <span>
        <h3>Error</h3>
        Running nbconvert failed with an error {render_time()}.{" "}
        {error.toLowerCase().includes("exporter") ? (
          <>
            You probably need to <b>restart your project</b> in project
            settings.
          </>
        ) : (
          <>
            Read the error log below, update your Jupyter notebook, then try
            again.
          </>
        )}
        <pre
          ref={preNode}
          style={{ maxHeight: "40vh", margin: "5px 20px", fontSize: "10px" }}
        >
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
  ({
    actions,
    path,
    project_id,
    nbconvert,
    nbconvert_dialog,
    backend_kernel_info,
  }: NBConvertProps) => {
    function target(): { targetPath?: string; url?: string; info? } {
      if (
        nbconvert == null ||
        nbconvert.get("error") ||
        nbconvert_dialog == null
      ) {
        return {};
      }
      const to = nbconvert_dialog.get("to");
      const info = NAMES[to];
      if (info == null) {
        return {};
      }
      let ext: string;
      // --to script converts to probably a .py file
      if (to === "script" && backend_kernel_info != null) {
        // special case where extension may be different
        ext = (
          backend_kernel_info.getIn(
            ["language_info", "file_extension"],
            "",
          ) as string
        ).slice(1);
        if (ext === "") {
          ext = "py";
        }
      } else {
        ext = info.ext;
      }
      const targetPath = misc.change_filename_extension(path, ext);
      const store = redux.getProjectStore(actions.project_id);
      const url = store.fileURL(targetPath);
      return { targetPath, url, info };
    }

    // on show of dialog, start running, if not already running.
    useEffect(() => {
      if (nbconvert_dialog == null) {
        return;
      }
      const state = nbconvert?.get("state");
      if (state != "start" && state != "run") {
        run();
      }
    }, [nbconvert_dialog]);

    // When state changes from run to done, cause download to
    // happen automatically.
    const lastState = useRef<string | undefined>(nbconvert?.get("state"));
    useEffect(() => {
      const state = nbconvert?.get("state");
      if (state == "done" && lastState.current != "done") {
        const { targetPath } = target();
        if (targetPath) {
          redux
            .getProjectActions(actions.project_id)
            ?.download_file({ path: targetPath });
        }
      }
      lastState.current = state;
    }, [nbconvert]);

    function close(): void {
      actions.setState({ nbconvert_dialog: undefined });
      actions.focus(true);
    }

    function renderEdit(target_path: any) {
      return (
        <div>
          <br />
          <Button
            type="primary"
            onClick={() => {
              actions.file_action("open_file", target_path);
              close();
            }}
          >
            Open Exported File
          </Button>
        </div>
      );
    }

    function renderDownload() {
      const { targetPath, url, info } = target();
      if (!targetPath || !url || !info) return;
      return (
        <div>
          Successfully exported Jupyter notebook to{" "}
          {!info.nolink && (
            <>
              <A href={url}>{targetPath}</A>.
            </>
          )}
          {info.internal && renderEdit(targetPath)}
        </div>
      );
    }

    function renderError() {
      if (nbconvert?.get("error")) {
        return <Error actions={actions} nbconvert={nbconvert} />;
      }
    }

    function render_recent_run() {
      let time = nbconvert?.get("time");
      if (time == null) {
        return;
      }
      if (time < misc.server_minutes_ago(5)) {
        // only show if recent
        return;
      }
      if (!nbconvert?.get("args")?.equals(immutable.fromJS(args()))) {
        // Only show if same args.
        return;
      }
      time = (
        <b>
          <TimeAgo date={new Date(time)} />
        </b>
      );
      return (
        <div>
          {renderError()}
          <div>{renderDownload()}</div>
        </div>
      );
    }

    function render_started() {
      const start = nbconvert != null ? nbconvert.get("start") : undefined;
      if (start == null) {
        return;
      }
      return (
        <span>
          (started <TimeAgo date={new Date(start)} />)
        </span>
      );
    }

    function render_current() {
      if (nbconvert_dialog == null) {
        return;
      }
      const state = nbconvert?.get("state");
      switch (state) {
        case "start":
          return <div>Requesting to convert...</div>;
        case "run":
          return (
            <div>
              <Loading
                style={{ fontSize: "20px", color: "#666" }}
                text="Exporting..."
              />{" "}
              <ProgressEstimate
                seconds={NAMES[nbconvert_dialog.get("to")]?.estimate ?? 60}
              />
              {render_started()}
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
      const to = nbconvert_dialog?.get("to");
      if (to == "script") {
        // ensure kernel info is initialized, which is used for
        // determining the target file extension in case of exporting
        // to an executable script.  This makes backend_kernel_info get set.
        actions.set_backend_kernel_info();
      }
      // start it going
      actions.nbconvert(args());
    }

    function targetDescription(): string {
      return NAMES[nbconvert_dialog?.get("to")]?.display ?? "";
    }

    function slides_command(): string {
      return `jupyter nbconvert --to slides --ServePostProcessor.port=18080 --ServePostProcessor.ip='*' --ServePostProcessor.open_in_browser=False ~/'${path}' --post serve`;
    }

    function slides_url(): string {
      const base = misc.separate_file_extension(
        misc.path_split(path).tail,
      ).name;
      const name = base + ".slides.html#/";
      return `https://cocalc.com/${project_id}/server/18080/` + name;
    }

    function render_slides_workaround() {
      // workaround until #2569 is fixed.
      return (
        <Modal
          open={nbconvert_dialog != null}
          onOk={close}
          onCancel={close}
          footer={null}
          title={
            <>
              <Icon name="slides" /> Jupyter Notebook Slideshow
            </>
          }
        >
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
      <Modal
        open={nbconvert_dialog != null}
        onOk={close}
        onCancel={close}
        title={
          <>
            <Icon
              name="cloud-download"
              style={{ fontSize: "20px", marginRight: "5px" }}
            />{" "}
            Save and Download as {targetDescription()}
          </>
        }
        footer={null}
      >
        {render_current()}
      </Modal>
    );
  },
);

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
About dialog -- provides info about the Jupyter Notebook
*/

import Ansi from "ansi-to-react";
import { React } from "../app-framework";
import { Button, Modal } from "react-bootstrap";
import { Icon, A } from "../components";
const { ShowSupportLink } = require("../support");
import { JUPYTER_CLASSIC_MODERN } from "@cocalc/util/theme";
import { KernelInfo } from "./types";
import { JupyterActions } from "./browser-actions";

interface AboutProps {
  actions: JupyterActions;
  about?: boolean;
  backend_kernel_info?: KernelInfo;
}

export const About: React.FC<AboutProps> = React.memo((props: AboutProps) => {
  const { actions, about, backend_kernel_info } = props;

  function close(): void {
    actions.setState({ about: false });
    actions.focus(true);
  }

  function render_server_info(): JSX.Element {
    const version =
      backend_kernel_info != null
        ? backend_kernel_info.get("nodejs_version")
        : undefined;
    if (!version) {
      return <div>Waiting for server to be available...</div>;
    }
    return <pre>Node.js Version {version}</pre>;
  }

  function render_kernel_info(): JSX.Element {
    const banner =
      backend_kernel_info != null
        ? backend_kernel_info.get("banner")
        : undefined;
    if (banner == null) {
      return <div>Waiting for kernel to be available...</div>;
    }
    return (
      <pre>
        <Ansi>{banner}</Ansi>
      </pre>
    );
  }

  function render_faq(): JSX.Element {
    return (
      <span>
        Read <A href="https://doc.cocalc.com/jupyter.html">documentation</A>
        , create a <ShowSupportLink />, or check the latest{" "}
        <A href={JUPYTER_CLASSIC_MODERN}>status of Jupyter in CoCalc.</A>
      </span>
    );
  }

  function render_features(): JSX.Element {
    return (
      <ul
        style={{
          marginTop: "10px",
          padding: "10px",
          paddingLeft: "30px",
          backgroundColor: "#fafafa",
          fontSize: "11pt",
        }}
      >
        <li>
          <b>Realtime sync:</b> Multiple people can simultaneously edit
          notebooks: multiple cursors, document-wide user-specific undo and
          redo, realtime synchronized ipywidgets
        </li>
        <li>
          <b>Document split:</b> edit and see multiple parts of a large notebook
          at once
        </li>
        <li>
          <b>TimeTravel:</b> see detailed history of exactly how a notebook was
          created
        </li>
        <li>
          <b>Snippets:</b> code samples for many kernels
        </li>
        <li>
          <b>Whiteboard:</b> create a whiteboard (documented ending in ".board")
          and use Jupyter cells as part of your whiteboard
        </li>
        <li>
          <b>Zoom:</b> easily change font size
        </li>
        <li>
          <b>Code folding:</b> see structure of input
        </li>
        <li>
          <b>Code formatting:</b> click the Format button to automatically
          format your code and markdown.
        </li>
        <li>
          <b>Modern look:</b> buttons, menus and cell execution hints that
          better reflect state
        </li>
        <li>
          <b>Large output:</b> server-side throttling, windowing, and buffering
        </li>
        <li>
          <b>Background capture of output:</b> works if no user has the notebook
          open (
          <A href="https://github.com/jupyterlab/jupyterlab/issues/6545#issuecomment-501259211">
            discussion
          </A>
          )
        </li>
        <li>
          <b>Mobile support:</b> phones and tablets
        </li>
        <li>
          <b>Cell creation:</b> click blue line between cells to create new
          cells
        </li>
        <li>
          <b>Share:</b> your work is visible publicly via our fast lightweight
          notebook viewer
        </li>
        <li>
          <b>LaTeX:</b> export notebook to LaTeX, then edit the generated LaTeX
          directly in CoCalc.
        </li>
        <li>
          <b>Keybindings and color schemes:</b> VIM, Emacs, and Sublime
          keybindings, and many color schemes (in account settings)
        </li>
      </ul>
    );
  }

  return (
    <Modal show={about} bsSize="large" onHide={close}>
      <Modal.Header closeButton>
        <Modal.Title>
          <Icon name="question-circle" /> About CoCalc Jupyter notebook
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>You are using the CoCalc Jupyter notebook.</p>

        <div style={{ color: "#333", margin: "0px 45px" }}>
          CoCalc Jupyter notebook is a complete open source rewrite by SageMath,
          Inc. of the classical Jupyter notebook client from the{" "}
          <A href="http://jupyter.org/">Jupyter project</A>. CoCalc Jupyter
          notebook maintains full compatibility with the file format and general
          look and feel of the classical notebook. It improves on the classical
          notebook as follows:
          {render_features()}
          Some functionality of classical extensions are not yet supported (if
          you need something,{" "}
          <A href="https://github.com/sagemathinc/cocalc/issues?q=is%3Aissue+is%3Aopen+label%3AA-jupyter">
            check here
          </A>{" "}
          and create a <ShowSupportLink />
          ), and some of the above is also available in classical Jupyter via
          extensions.
        </div>

        <h4>Questions</h4>
        {render_faq()}

        <h4>Server Information</h4>
        {render_server_info()}

        <h4>Current Kernel Information</h4>
        {render_kernel_info()}
      </Modal.Body>

      <Modal.Footer>
        <Button onClick={close}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
});

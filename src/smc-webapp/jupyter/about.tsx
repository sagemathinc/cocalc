/*
About dialog -- provides info about the Jupyter Notebook
*/

import * as Ansi from "ansi-to-react";
import { React, Component, Rendered } from "../app-framework";
import { Button, Modal } from "react-bootstrap";
import { Icon } from "../r_misc";
const { ShowSupportLink } = require("../support");
import { JUPYTER_CLASSIC_MODERN } from "smc-util/theme";
import { KernelInfo } from "./types";
import { JupyterActions } from "./browser-actions";

interface AboutProps {
  actions: JupyterActions;
  about?: boolean;
  backend_kernel_info?: KernelInfo;
}

export class About extends Component<AboutProps> {
  private close(): void {
    this.props.actions.setState({ about: false });
    this.props.actions.focus(true);
  }

  private render_server_info(): Rendered {
    const version =
      this.props.backend_kernel_info != null
        ? this.props.backend_kernel_info.get("nodejs_version")
        : undefined;
    if (!version) {
      return <div>Waiting for server to be available...</div>;
    }
    return <pre>Node.js Version {version}</pre>;
  }

  private render_kernel_info(): Rendered {
    const banner =
      this.props.backend_kernel_info != null
        ? this.props.backend_kernel_info.get("banner")
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

  private render_faq(): Rendered {
    return (
      <span>
        Read{" "}
        <a
          href="https://doc.cocalc.com/jupyter.html"
          target="_blank"
          rel="noopener"
        >
          documentation
        </a>
        , create a <ShowSupportLink />, or check the latest{" "}
        <a href={JUPYTER_CLASSIC_MODERN} target="_blank" rel="noopener">
          status of Jupyter in CoCalc.
        </a>
      </span>
    );
  }

  private render_features(): Rendered {
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
          <b>Windowing:</b> Only visible cells are rendered, which makes it
          possible to efficiently work with very large notebooks having hundreds
          of cells
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
          <a
            href="https://github.com/jupyterlab/jupyterlab/issues/6545#issuecomment-501259211"
            target="_blank"
            rel="noopener"
          >
            discussion
          </a>
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

  public render(): Rendered {
    return (
      <Modal
        show={this.props.about}
        bsSize="large"
        onHide={this.close.bind(this)}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="question-circle" /> About CoCalc Jupyter notebook
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>You are using the CoCalc Jupyter notebook.</p>

          <div style={{ color: "#333", margin: "0px 45px" }}>
            CoCalc Jupyter notebook is a complete open source rewrite by
            SageMath, Inc. of the classical Jupyter notebook client from the{" "}
            <a href="http://jupyter.org/" target="_blank" rel="noopener">
              Jupyter project
            </a>
            . CoCalc Jupyter notebook maintains full compatibility with the file
            format and general look and feel of the classical notebook. It
            improves on the classical notebook as follows:
            {this.render_features()}
            Some functionality of classical extensions are not yet supported (if
            you need something,{" "}
            <a
              href="https://github.com/sagemathinc/cocalc/issues?q=is%3Aissue+is%3Aopen+label%3AA-jupyter"
              target="_blank"
              rel="noopener"
            >
              check here
            </a>{" "}
            and create a <ShowSupportLink />
            ), and some of the above is also available in classical Jupyter via
            extensions.
          </div>

          <h4>Questions</h4>
          {this.render_faq()}

          <h4>Server Information</h4>
          {this.render_server_info()}

          <h4>Current Kernel Information</h4>
          {this.render_kernel_info()}
        </Modal.Body>

        <Modal.Footer>
          <Button onClick={this.close.bind(this)}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

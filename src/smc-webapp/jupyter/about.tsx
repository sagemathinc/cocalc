/*
About dialog -- provides info about the Jupyter Notebook
*/

const Ansi = require("ansi-to-react");
import { React, Component } from "../app-framework"; // TODO: this will move
import { Button, Modal } from "react-bootstrap";
const { Icon } = require("../r_misc"); // TODO: import types
const { ShowSupportLink } = require("../support"); // TODO: import types
import { Map as ImmutableMap } from "immutable";
const { JUPYTER_CLASSIC_MODERN } = require("smc-util/theme");

interface AboutProps {
  actions: any;
  about?: boolean;
  backend_kernel_info?: ImmutableMap<any, any>;
}

export class About extends Component<AboutProps> {
  close = () => {
    this.props.actions.setState({ about: false });
    this.props.actions.focus(true);
  };

  render_server_info() {
    const version =
      this.props.backend_kernel_info != null
        ? this.props.backend_kernel_info.get("nodejs_version")
        : undefined;
    if (!version) {
      return <div>Waiting for server to be available...</div>;
    }
    return <pre>Node.js Version {version}</pre>;
  }

  render_kernel_info() {
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

  render_faq() {
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
        , create a <ShowSupportLink />, or see the latest{" "}
        <a href={JUPYTER_CLASSIC_MODERN} target="_blank" rel="noopener">
          status of Jupyter in CoCalc.
        </a>
      </span>
    );
  }

  render_features() {
    return (
      <ul
        style={{
          marginTop: "10px",
          padding: "10px",
          paddingLeft: "30px",
          backgroundColor: "#fafafa",
          fontSize: "11pt"
        }}
      >
        <li>
          Multiple people can simultaneously edit notebooks: multiple cursors,
          document-wide user-specific undo and redo, realtime synchronized
          ipywidgets
        </li>
        <li>
          TimeTravel shows detailed history of exactly how a notebook was
          created
        </li>
        <li> Zoom in and out for demos or tired eyes</li>
        <li> Code folding</li>
        <li>
          Modern look with buttons, menus and cell execution hints that better
          reflect state
        </li>
        <li>
          Sophisticated handling of large output: throttling, windowing, backend
          buffering
        </li>
        <li>
          Background capture of output even if no user has the notebook open
        </li>
        <li> Improved phone and tablet support</li>
        <li> Click blue line between cells to create new cells</li>
        <li>
          Easily sharing your work publicly with our client-side notebook viewer
        </li>
        <li>
          Raw file edit mode: synchronized editing of underlying ipynb file
        </li>
        <li>
          Easily export notebook to LaTeX, then edit the generated LaTeX with
          our integrated LaTeX editor
        </li>
        <li>
          VIM, Emacs, and Sublime keybindings, and color schemes (in account
          settings)
        </li>
      </ul>
    );
  }

  render() {
    return (
      <Modal show={this.props.about} bsSize="large" onHide={this.close}>
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
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

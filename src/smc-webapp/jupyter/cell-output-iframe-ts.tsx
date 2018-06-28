/*
Handle iframe output messages involving a srcdoc.
*/

import { React, Component } from "../app-framework"; // TODO: this will move

const { get_blob_url } = require("./server-urls"); // TODO: import and type
const { Icon } = require("../r_misc"); // TODO: import and type
import { Button } from "react-bootstrap";

export interface IFrameProps {
  sha1?: string;
  project_id?: string;
}

export interface IFrameState {
  show: boolean;
  attempts: number;
}

export class IFrame extends Component<IFrameProps, IFrameState> {
  private timeout: any; // TODO: WARNING: check this - its a different pattern than the original component, see https://github.com/facebook/react/issues/5465
  constructor(props: IFrameProps, context: any) {
    super(props, context);
    this.state = { attempts: 0, show: false };
  }
  clearTimeout = () => {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  };
  componentWillUmount() {
    this.clearTimeout();
  }
  load_error = () => {
    if (this.state.attempts < 5) {
      this.clearTimeout();
      this.timeout = setTimeout(
        () => this.setState(({ attempts }) => ({ attempts: attempts + 1 })),
        500
      );
    }
  };
  render_iframe = () => {
    const src =
      get_blob_url(this.props.project_id, "html", this.props.sha1) +
      `&attempts=${this.state.attempts}`;
    // TODO: should width/height be in style instead of attrs?
    return (
      <iframe
        src={src}
        onError={this.load_error}
        width="100%"
        height="500px"
        style={{ border: 0 }}
      />
    );
  };
  render() {
    if (this.state.show) {
      return this.render_iframe();
    }
    return (
      <Button onClick={() => this.setState({ show: true })} bsStyle="info">
        <Icon name="cube" /> Load Viewer...
      </Button>
    );
  }
}

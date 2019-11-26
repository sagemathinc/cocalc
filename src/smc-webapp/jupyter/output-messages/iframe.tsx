/*
Handle iframe output messages involving a src doc.
*/

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { get_blob_url } from "../server-urls";
import { Icon } from "smc-webapp/r_misc";
import { Button } from "react-bootstrap";

interface IFrameProps {
  sha1: string;
  project_id: string;
}

interface IFrameState {
  show: boolean;
  attempts: number;
}

export class IFrame extends Component<IFrameProps, IFrameState> {
  // TODO: WARNING: check this - it's a different pattern than the original
  // component, see https://github.com/facebook/react/issues/5465
  private timeout: any;

  constructor(props: IFrameProps, context: any) {
    super(props, context);
    this.state = { attempts: 0, show: false };
  }

  clearTimeout = (): void => {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  };

  componentWillUmount(): void {
    this.clearTimeout();
  }

  load_error = (): void => {
    if (this.state.attempts < 5) {
      this.clearTimeout();
      this.timeout = setTimeout(
        () => this.setState(({ attempts }) => ({ attempts: attempts + 1 })),
        500
      );
    }
  };

  render_iframe = (): Rendered => {
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

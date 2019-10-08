/*
A button that when clicked, shows a loading indicator until the backend
Jupyter notebook server is running, then pops it up in a new tab.
*/

import { exec } from "../frame-editors/generic/client";

import { Component, React, Rendered } from "../app-framework";

import { Icon, SettingBox } from "../r_misc";

const { LinkRetryUntilSuccess } = require("../widgets-misc/link-retry");

interface Props {
  project_id: string;
}

export class JupyterLabServerPanel extends Component<Props, {}> {
  displayName = "ProjectSettings-JupyterServer";
  private is_mounted: boolean = false;

  constructor(props) {
    super(props);
    this.get_href = this.get_href.bind(this);
  }

  async componentDidMount(): Promise<void> {
    this.is_mounted = true;
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
  }

  async get_href(): Promise<string> {
    const url = await jupyterlab_server_url(this.props.project_id);
    if (!this.is_mounted) {
      throw Error("unmounted");
    }
    return url;
  }

  render_jupyter_link(): Rendered {
    return (
      <LinkRetryUntilSuccess get_href={this.get_href}>
        <Icon name="cc-icon-ipynb" /> JupyterLab Server
      </LinkRetryUntilSuccess>
    );
  }

  render(): Rendered {
    return (
      <SettingBox title="JupyterLab Server" icon="list-alt">
        <span style={{ color: "#444" }}>
          The JupyterLab server runs from your project and provides support for
          Jupyter notebooks, terminals, drag and drop, with a nice multiwindow
          layout, and much more. JupyterLab does not yet support multiple users
          or TimeTravel, but fully supports most Jupyter notebook features and
          extensions.
          <br />
          <br />
          Click the link below to start your Jupyter notebook server and open it
          in a new browser tab.
        </span>
        <div style={{ textAlign: "center", fontSize: "14pt", margin: "15px" }}>
          {this.render_jupyter_link()}
        </div>
      </SettingBox>
    );
  }
}

export async function jupyterlab_server_url(project_id: string): Promise<string> {
  let out = JSON.parse(
    (await exec({ project_id, command: "cc-jupyterlab", args: ["status"] }))
      .stdout
  );
  let port;
  if (out.status === "stopped") {
    port = JSON.parse(
      (await exec({ project_id, command: "cc-jupyterlab", args: ["start"] }))
        .stdout
    ).port;
  } else {
    port = out.port;
  }
  return `${window.app_base_url}/${project_id}/port/${port}`;
}

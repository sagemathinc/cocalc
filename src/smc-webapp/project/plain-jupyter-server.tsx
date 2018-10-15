/*
A button that when clicked, shows a loading indicator until the backend
Jupyter notebook server is running, then pops it up in a new tab.
*/

import { Component, React, Rendered } from "../app-framework";

const { ProjectSettingsPanel } = require("./project-settings-support");

const { Icon } = require("../r_misc");

const { jupyter_server_url } = require("../editor_jupyter");

const { LinkRetryUntilSuccess } = require("../widgets-misc/link-retry");

interface Props {
  project_id: string;
}

export class JupyterServerPanel extends Component<Props, {}> {
  displayName = "ProjectSettings-JupyterServer";

  render_jupyter_link(): Rendered {
    const url = jupyter_server_url(this.props.project_id);
    return (
      <LinkRetryUntilSuccess href={url}>
        <Icon name="cc-icon-ipynb" /> Plain Jupyter Server
      </LinkRetryUntilSuccess>
    );
  }

  render(): Rendered {
    return (
      <ProjectSettingsPanel title="Plain Jupyter server" icon="list-alt">
        <span style={{ color: "#444" }}>
          The Jupyter notebook server runs in your project and provides support
          for classical Jupyter notebooks. You can also use the plain classical
          Jupyter notebook server directly via the link below. This does not
          support multiple users or TimeTravel, but fully supports all classical
          Jupyter notebook features and extensions.
          <br />
          <br />
          Click the link below to start your Jupyter notebook server and open it
          in a new browser tab.
        </span>
        <div style={{ textAlign: "center", fontSize: "14pt", margin: "15px" }}>
          {this.render_jupyter_link()}
        </div>
      </ProjectSettingsPanel>
    );
  }
}

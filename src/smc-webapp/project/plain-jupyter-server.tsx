/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A button that when clicked, shows a loading indicator until the backend
Jupyter notebook server is running, then pops it up in a new tab.
*/

import { React } from "../app-framework";
import { Icon, SettingBox } from "../r_misc";
import { LinkRetryUntilSuccess } from "../widgets-misc/link-retry";
import { useStudentProjectFunctionality } from "course";

const { jupyter_server_url } = require("../editor_jupyter");

interface Props {
  project_id: string;
}

export const JupyterServerPanel: React.FC<Props> = ({ project_id }) => {
  const student_project_functionality = useStudentProjectFunctionality(
    project_id
  );

  function render_jupyter_link(): JSX.Element {
    const url = jupyter_server_url(project_id);
    return (
      <LinkRetryUntilSuccess href={url}>
        <Icon name="cc-icon-ipynb" /> Plain Jupyter Classic Server
      </LinkRetryUntilSuccess>
    );
  }

  let body;
  if (student_project_functionality.disableJupyterClassicServer) {
    body = "Disabled. Please contact your instructor if you need to use this.";
  } else {
    body = (
      <>
        <span style={{ color: "#444" }}>
          The Jupyter Classic notebook server runs in your project and provides
          support for classical Jupyter notebooks. You can also use the plain
          classical Jupyter notebook server directly via the link below. This
          does not support multiple users or TimeTravel, but fully supports all
          classical Jupyter notebook features and extensions.
          <br />
          <br />
          Click the link below to start your Jupyter Classic notebook server and
          open it in a new browser tab.
        </span>
        <div style={{ textAlign: "center", fontSize: "14pt", margin: "15px" }}>
          {render_jupyter_link()}
        </div>
      </>
    );
  }

  return (
    <SettingBox title="Plain Jupyter Classic Server" icon="list-alt">
      {body}
    </SettingBox>
  );
};

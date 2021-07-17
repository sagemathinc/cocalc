/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A button that when clicked, shows a loading indicator until the backend
Jupyter notebook server is running, then pops it up in a new tab.
*/

import { join } from "path";
import { React, useIsMountedRef } from "smc-webapp/app-framework";
import { Icon, SettingBox } from "../r_misc";
import { LinkRetryUntilSuccess } from "../widgets-misc/link-retry";
import { useStudentProjectFunctionality } from "smc-webapp/course";

interface Props {
  project_id: string;
}

export const JupyterLabServerPanel: React.FC<Props> = ({ project_id }) => {
  const isMountedRef = useIsMountedRef();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  async function get_href(): Promise<string> {
    const url = await jupyterlab_server_url(project_id);
    if (!isMountedRef.current) {
      throw Error("unmounted");
    }
    return url;
  }

  function render_jupyter_link(): JSX.Element {
    return (
      <LinkRetryUntilSuccess get_href={get_href}>
        <Icon name="ipynb" /> JupyterLab Server
      </LinkRetryUntilSuccess>
    );
  }

  let body;
  if (student_project_functionality.disableJupyterLabServer) {
    body = "Disabled. Please contact your instructor if you need to use this.";
  } else {
    body = (
      <>
        <span style={{ color: "#444" }}>
          The JupyterLab server runs from your project and provides support for
          Jupyter notebooks, terminals, drag and drop, with a nice multiwindow
          layout, and much more. JupyterLab does not yet support multiple users
          or TimeTravel, but fully supports most Jupyter notebook features and
          extensions.
          <br />
          <br />
          Click the link below to start your JupyterLab notebook server and open
          it in a new browser tab.
        </span>
        <div style={{ textAlign: "center", fontSize: "14pt", margin: "15px" }}>
          {render_jupyter_link()}
        </div>
      </>
    );
  }

  return (
    <SettingBox title="JupyterLab Server" icon="list-alt">
      {body}
    </SettingBox>
  );
};

export async function jupyterlab_server_url(
  project_id: string
): Promise<string> {
  return join(window.app_base_path, project_id, "port", "jupyterlab");
}

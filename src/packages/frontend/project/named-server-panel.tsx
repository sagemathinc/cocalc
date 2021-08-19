/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A button that when clicked, shows a loading indicator until the backend
Jupyter notebook server is running, then pops it up in a new tab.
*/

import { join } from "path";
import { React } from "@cocalc/frontend/app-framework";
import { Icon, IconName, SettingBox } from "../r_misc";
import LinkRetry from "../widgets-misc/link-retry";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { capitalize } from "@cocalc/util/misc";

const SPEC: {
  [name: string]: {
    longName: string;
    description: string;
    usesBasePath: boolean;
    icon: IconName;
  };
} = {
  jupyter: {
    longName: "Jupyter Classic Notebook",
    description: `The Jupyter Classic notebook server runs in your project and provides
support for classical Jupyter notebooks. You can also use the plain
classical Jupyter notebook server directly via the link below. This
does not support multiple users or TimeTravel, but fully supports all
classical Jupyter notebook features and extensions.`,
    usesBasePath: true,
    icon: "ipynb",
  },
  jupyterlab: {
    longName: "JupyterLab Notebook",
    description: `The JupyterLab server runs from your project and provides support for
Jupyter notebooks, terminals, drag and drop, with a nice multiwindow
layout, and much more. JupyterLab does not yet support multiple users
or TimeTravel, but fully supports most Jupyter notebook features and
extensions.`,
    usesBasePath: true,
    icon: "ipynb",
  },
  code: {
    longName: "Visual Studio Code",
    description: `Visal Studio Code is a source-code editor made by Microsoft. Features
include support for debugging, syntax highlighting, intelligent
code completion, snippets, code refactoring, and embedded Git.`,
    usesBasePath: false,
    icon: "vscode",
  },
  pluto: {
    longName: "Julia Pluto.jl",
    description: "Reactive notebooks for Julia.",
    usesBasePath: false,
    icon: "julia",
  },
};

interface Props {
  project_id: string;
  name: string;
}

export const NamedServerPanel: React.FC<Props> = ({ project_id, name }) => {
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const { longName, description, icon } = SPEC[name] ?? {
    icon: "server",
    longName: `${capitalize(name)} Server`,
    description: `The ${capitalize(
      name
    )} server runs from your project. It does not yet
          support multiple users or TimeTravel, but fully supports most other
          features and extensions of ${name}.`,
  };

  let body;
  if (
    name == "jupyterlab" &&
    student_project_functionality.disableJupyterLabServer
  ) {
    body = "Disabled. Please contact your instructor if you need to use this.";
  } else if (
    name == "jupyter" &&
    student_project_functionality.disableJupyterLabServer
  ) {
    body = "Disabled. Please contact your instructor if you need to use this.";
  } else {
    body = (
      <>
        <span style={{ color: "#444" }}>
          {description}
          <br />
          <br />
          Click the link below to start your {longName} server and open it in a
          new browser tab.
        </span>
        <div style={{ textAlign: "center", fontSize: "14pt", margin: "15px" }}>
          <LinkRetry href={serverURL(project_id, name)}>
            <Icon name={icon} /> {longName} Server
          </LinkRetry>
        </div>
      </>
    );
  }

  return (
    <SettingBox title={`${longName} Server`} icon={icon}>
      {body}
    </SettingBox>
  );
};

export function serverURL(project_id: string, name: string): string {
  return (
    join(
      window.app_base_path,
      project_id,
      SPEC[name]?.usesBasePath ? "port" : "server",
      name
    ) + "/"
  );
}

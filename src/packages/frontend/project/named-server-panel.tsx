/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
A button that when clicked, shows a loading indicator until the backend
Jupyter notebook server is running, then pops it up in a new tab.
*/

import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";
import { CSS } from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  Paragraph,
  SettingBox,
} from "@cocalc/frontend/components";
import LinkRetry from "@cocalc/frontend/components/link-retry";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { IntlMessage } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";
import { R_IDE } from "@cocalc/util/consts/ui";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { NamedServerName } from "@cocalc/util/types/servers";
import { useAvailableFeatures } from "./use-available-features";
import AppState from "@cocalc/frontend/project/apps/app-state";
import { useState } from "react";
import { useAppStatus } from "@cocalc/frontend/project/apps/use-app-status";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button } from "antd";

const LAUNCHING_SERVER = defineMessage({
  id: "project.named-server-panel.launching_server",
  defaultMessage: "Launching server...",
  description: "A web-service is starting.",
});

interface Server {
  longName: string;
  description: IntlMessage;
  usesBasePath: boolean;
  icon: IconName;
}

export const SPEC: {
  [name in NamedServerName]: Server;
} = {
  jupyter: {
    longName: "Jupyter Classic Notebook",
    description: defineMessage({
      id: "project.named-server-panel.spec.jupyter.description",
      defaultMessage: `The Jupyter Classic notebook server runs in your project and provides
      support for classical Jupyter notebooks.
      You can also use the plain classical Jupyter notebook server directly via the link below.
      This does not support multiple users or TimeTravel,
      but fully supports all classical Jupyter notebook features and extensions.`,
    }),
    usesBasePath: true,
    icon: "ipynb",
  },
  jupyterlab: {
    longName: "JupyterLab Notebook",
    description: defineMessage({
      id: "project.named-server-panel.spec.jupyterlab.description",
      defaultMessage: `The JupyterLab server runs from your project and provides support for Jupyter notebooks,
      terminals, drag and drop, with a nice multiwindow layout, and much more.
      JupyterLab does not yet support multiple users or TimeTravel,
      but fully supports most Jupyter notebook features and extensions.`,
    }),
    usesBasePath: true,
    icon: "ipynb",
  },
  code: {
    longName: "Visual Studio Code",
    description: defineMessage({
      id: "project.named-server-panel.spec.code.description",
      defaultMessage: `Visual Studio Code is a source-code editor made by Microsoft.
      Features include support for debugging, syntax highlighting,
      intelligent code completion, snippets, code refactoring, and embedded Git.`,
    }),
    usesBasePath: false,
    icon: "vscode",
  },
  xpra: {
    longName: "Xpra X11 Desktop",
    description: defineMessage({
      id: "project.named-server-panel.spec.xpra.description",
      defaultMessage: `Run graphical Linux applications in your web browser.`,
    }),
    usesBasePath: false,
    icon: "desktop",
  },
  pluto: {
    longName: "Julia Pluto.jl",
    description: defineMessage({
      id: "project.named-server-panel.spec.pluto.description",
      defaultMessage: `Reactive notebooks for Julia.
      <b>NOTE: Pluto may take a long time to start, so be patient.</b> `,
    }),

    usesBasePath: false,
    icon: "julia",
  },
  rserver: {
    longName: R_IDE,
    description: defineMessage({
      id: "project.named-server-panel.spec.rserver.description",
      defaultMessage: `This is an integrated development environment (IDE) for R.
      It is provided without any modifications.
      <b>DISCLAIMER: Posit Software, PBC (formerly RStudio, PBC) IS IN NO WAY ASSOCIATED WITH COCALC.</b>`,
    }),
    usesBasePath: false,
    icon: "r",
  },
} as const;

function getServerInfo(name: NamedServerName): Server {
  return (
    SPEC[name] ?? {
      icon: "server",
      longName: `${capitalize(name)} Server`,
      description: defineMessage({
        id: "project.named-server-panel.spec.server.description",
        defaultMessage: `The {name} server runs from your project.
        It does not yet support multiple users or TimeTravel,
        but fully supports most other features and extensions of {name}.`,
      }),
    }
  );
}

const DISABLED = defineMessage({
  id: "project.named-server-panel.disabled.info",
  defaultMessage: `"Disabled. Please contact your instructor if you need to use {longName}.`,
});

interface Props {
  project_id: string;
  name: NamedServerName;
  style?: CSS;
}

export function NamedServerPanel({ project_id, name, style }: Props) {
  const intl = useIntl();
  const [url, setUrl] = useState<string | undefined>(undefined);

  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const { longName, description: descMsg, icon } = getServerInfo(name);
  const description = intl.formatMessage(descMsg, { name: capitalize(name) });

  let body;
  if (
    name === "jupyterlab" &&
    student_project_functionality.disableJupyterLabServer
  ) {
    body = intl.formatMessage(DISABLED, { longName });
  } else if (
    name === "jupyter" &&
    student_project_functionality.disableJupyterClassicServer
  ) {
    body = intl.formatMessage(DISABLED, { longName });
  } else if (
    name === "code" &&
    student_project_functionality.disableVSCodeServer
  ) {
    body = intl.formatMessage(DISABLED, { longName });
  } else if (
    name === "pluto" &&
    student_project_functionality.disablePlutoServer
  ) {
    body = intl.formatMessage(DISABLED, { longName });
  } else if (
    name === "rserver" &&
    student_project_functionality.disableRServer
  ) {
    body = intl.formatMessage(DISABLED, { longName });
  } else if (!url) {
    body = null;
  } else {
    body = (
      <>
        <Paragraph style={{ color: COLORS.GRAY_D }}>
          {description}
          <br />
          <br />
          <FormattedMessage
            id="project.named-server-panel.long_start_info"
            defaultMessage={`Starting your {longName} server.
            It will then attempt to open in a new  browser tab.
            If this doesn't work, check for a popup blocker warning!`}
            values={{ longName }}
          />
        </Paragraph>
        {url && (
          <Paragraph
            style={{ textAlign: "center", fontSize: "14pt", margin: "15px" }}
          >
            <LinkRetry
              maxTime={1000 * 60 * 5}
              autoStart
              href={url}
              loadingText={intl.formatMessage(LAUNCHING_SERVER)}
              onClick={() => {
                track("launch-server", { name, project_id });
              }}
            >
              <Icon name={icon} /> {longName} Server...
            </LinkRetry>
          </Paragraph>
        )}
      </>
    );
  }

  return (
    <SettingBox title={`${longName} Server`} icon={icon} style={style}>
      {body}
      <AppState name={name} setUrl={setUrl} autoStart />
    </SettingBox>
  );
}

export function serverURL(project_id: string, name: NamedServerName): string {
  return (
    join(
      appBasePath,
      project_id,
      SPEC[name]?.usesBasePath ? "port" : "server",
      name,
    ) + "/"
  );
}

export function ServerLink({
  project_id,
  name,
  mode = "full",
}: {
  project_id: string;
  name: NamedServerName;
  mode: "flyout" | "full";
}) {
  const appStatus = useAppStatus({ name });
  const intl = useIntl();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const available = useAvailableFeatures(project_id);

  if (
    name === "jupyterlab" &&
    (!available.jupyter_lab ||
      student_project_functionality.disableJupyterLabServer)
  ) {
    return null;
  } else if (
    name === "jupyter" &&
    (!available.jupyter_notebook ||
      student_project_functionality.disableJupyterClassicServer)
  ) {
    return null;
  } else if (
    name === "code" &&
    (!available.vscode || student_project_functionality.disableVSCodeServer)
  ) {
    return null;
  } else if (
    name === "pluto" &&
    (!available.julia || student_project_functionality.disablePlutoServer)
  ) {
    return null;
  } else if (
    name === "rserver" &&
    (!available.rserver || student_project_functionality.disableRServer)
  ) {
    return null;
  }

  if (!appStatus.status?.url) {
    return (
      <Button
        onClick={async () => {
          const api = webapp_client.conat_client.projectApi({ project_id });
          await api.apps.start(name);
          appStatus.refresh();
        }}
      >
        Start {name}
      </Button>
    );
  }

  const { icon, longName, description: descMsg } = getServerInfo(name);
  const description = intl.formatMessage(descMsg, { name: capitalize(name) });
  return (
    <LinkRetry
      maxTime={1000 * 60 * 5}
      href={appStatus.status?.url}
      loadingText={intl.formatMessage(LAUNCHING_SERVER)}
      tooltip={mode === "flyout" ? description : undefined}
      onClick={() => {
        track("launch-server", { name, project_id });
      }}
    >
      <Icon name={icon} /> {longName}...
    </LinkRetry>
  );
}

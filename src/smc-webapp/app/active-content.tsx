/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ProjectPage } from "../project/page/page";
import { React, useTypedRedux } from "../app-framework";
import { ProjectsPage } from "../projects/projects-page";
import { AccountPage } from "../account/account-page";
import { KioskModeBanner } from "./kiosk-mode-banner";
import { InfoPage } from "../info/info";
import { FileUsePage } from "../file-use/page";
import { NotificationPage } from "../notifications";
import { AdminPage } from "../admin";
import { Connecting } from "../landing-page/connecting";

export const ActiveContent: React.FC = React.memo(() => {
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const fullscreen = useTypedRedux("page", "fullscreen");
  const open_projects = useTypedRedux("projects", "open_projects");

  const v: JSX.Element[] = [];
  open_projects?.forEach((project_id: string) => {
    const is_active = project_id === active_top_tab;
    const x = <ProjectPage project_id={project_id} is_active={is_active} />;
    let cls = "smc-vfill";
    if (project_id !== active_top_tab) {
      cls += " hide";
    }
    v.push(
      <div key={project_id} className={cls}>
        {x}
      </div>
    );
  });

  // in kiosk mode: if no file is opened show a banner
  if (fullscreen == "kiosk" && v.length === 0) {
    v.push(<KioskModeBanner key={"kiosk"} />);
  } else {
    switch (active_top_tab) {
      case "projects":
        v.push(<ProjectsPage key={"projects"} />);
        break;
      case "account":
        v.push(<AccountPage key={"account"} />);
        break;
      case "help":
      case "about":
        v.push(<InfoPage key={"about"} />);
        break;
      case "file-use":
        v.push(<FileUsePage key={"file-use"} />);
        break;
      case "notifications":
        v.push(<NotificationPage key={"notifications"} />);
        break;
      case "admin":
        v.push(<AdminPage key={"admin"} />);
        break;
      case undefined:
        v.push(<div key={"broken"}>Please click a button on the top tab.</div>);
        break;
    }
  }

  if (v.length === 0) {
    // This happens upon loading a URL for a project, but the
    // project isn't open yet.  Implicitly, this waits for a
    // websocket connection, hence show the same banner as for the landing page
    v.push(<Connecting key={"connecting"} />);
  }
  return <>{v}</>;
});

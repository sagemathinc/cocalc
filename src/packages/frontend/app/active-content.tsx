/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { AccountPage } from "@cocalc/frontend/account/account-page";
import { AdminPage } from "@cocalc/frontend/admin";
import { Alert } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { FileUsePage } from "@cocalc/frontend/file-use/page";
import { Connecting } from "@cocalc/frontend/landing-page/connecting";
import { NotificationPage } from "@cocalc/frontend/notifications";
import { ProjectPage } from "@cocalc/frontend/project/page/page";
import { ProjectsPage } from "@cocalc/frontend/projects/projects-page";
import { KioskModeBanner } from "./kiosk-mode-banner";

const STYLE_SIGNIN_WARNING: CSS = {
  textAlign: "center",
  width: "max(300px, 50vw)",
  marginRight: "auto",
  marginLeft: "auto",
  marginTop: "50px",
} as const;

export const ActiveContent: React.FC = React.memo(() => {
  const page_actions = useActions("page");

  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const fullscreen = useTypedRedux("page", "fullscreen");
  const get_api_key = useTypedRedux("page", "get_api_key");
  const open_projects = useTypedRedux("projects", "open_projects");

  // initially, we assume a user is signed in – most likely case
  const [notSignedIn, setNotSignedIn] = React.useState<boolean>(false);
  const is_logged_in = useTypedRedux("account", "is_logged_in");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setNotSignedIn(!is_logged_in);
    }, 5 * 1000);
    return () => clearTimeout(timer);
  });

  const showSignInWarning = React.useMemo(() => {
    return !is_logged_in && notSignedIn;
  }, [is_logged_in, notSignedIn]);

  const v: React.JSX.Element[] = [];
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

  if (get_api_key) {
    // Only render the account page which has the message for allowing api access:
    return <AccountPage key={"account"} />;
  }

  function project_loading() {
    // This happens upon loading a URL for a project, but the
    // project isn't open yet.  Implicitly, this waits for a
    // websocket connection. To aid users towards signing up earlier
    // we show a warning box about maybe having to sign in.
    // https://github.com/sagemathinc/cocalc/issues/6092
    v.push(<Connecting key={"active-content-connecting"} />);
    if (showSignInWarning) {
      v.push(
        <div key="not-signed-in" style={STYLE_SIGNIN_WARNING}>
          <Alert bsStyle="warning" banner={false}>
            <Icon style={{ fontSize: "150%" }} name="exclamation-triangle" />
            <br />
            Your browser has not yet been able to connect to the <SiteName />{" "}
            service. You probably have to{" "}
            <a
              onClick={() => page_actions.set_active_tab("account")}
              style={{ fontWeight: "bold" }}
            >
              sign in
            </a>{" "}
            first, or otherwise check if you experience{" "}
            <A href={"https://doc.cocalc.com/howto/trouble.html"}>
              connectivity issues
            </A>
            .
          </Alert>
        </div>
      );
    }
  }

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
    project_loading();
  }

  return <>{v}</>;
});

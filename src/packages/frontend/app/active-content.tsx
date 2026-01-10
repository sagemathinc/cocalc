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
import { HostsPage } from "@cocalc/frontend/hosts/hosts-page";
import { AuthPage } from "@cocalc/frontend/auth";

const STYLE_SIGNIN_WARNING: CSS = {
  textAlign: "center",
  width: "max(300px, 50vw)",
  marginRight: "auto",
  marginLeft: "auto",
  marginTop: "50px",
} as const;

const STACK_CONTAINER_STYLE: CSS = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
} as const;

const STACK_LAYER_STYLE: CSS = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
} as const;

const STACK_LAYER_ACTIVE_STYLE: CSS = {
  opacity: 1,
  pointerEvents: "auto",
  visibility: "visible",
  zIndex: 1,
} as const;

const STACK_LAYER_INACTIVE_STYLE: CSS = {
  opacity: 0,
  pointerEvents: "none",
  visibility: "hidden",
  zIndex: 0,
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

  function renderLayer(
    key: string,
    is_active: boolean,
    content: React.ReactNode,
  ): React.JSX.Element {
    return (
      <div
        key={key}
        className="smc-vfill"
        style={{
          ...STACK_LAYER_STYLE,
          ...(is_active ? STACK_LAYER_ACTIVE_STYLE : STACK_LAYER_INACTIVE_STYLE),
        }}
        aria-hidden={!is_active}
      >
        {content}
      </div>
    );
  }

  const project_layers: React.JSX.Element[] = [];
  open_projects?.forEach((project_id: string) => {
    const is_active = project_id === active_top_tab;
    const x = <ProjectPage project_id={project_id} is_active={is_active} />;
    project_layers.push(renderLayer(project_id, is_active, x));
  });

  if (get_api_key) {
    // Only render the account page which has the message for allowing api access:
    return <AccountPage key={"account"} />;
  }

  function renderProjectLoading(): React.ReactNode {
    // This happens upon loading a URL for a project, but the
    // project isn't open yet.  Implicitly, this waits for a
    // websocket connection. To aid users towards signing up earlier
    // we show a warning box about maybe having to sign in.
    // https://github.com/sagemathinc/cocalc/issues/6092
    return (
      <>
        <Connecting />
        {showSignInWarning ? (
          <div style={STYLE_SIGNIN_WARNING}>
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
        ) : null}
      </>
    );
  }

  const layers: React.JSX.Element[] = [...project_layers];
  let overlay: React.JSX.Element | null = null;

  // in kiosk mode: if no file is opened show a banner
  if (fullscreen == "kiosk" && project_layers.length === 0) {
    overlay = renderLayer("kiosk", true, <KioskModeBanner />);
  } else {
    switch (active_top_tab) {
      case "projects":
        overlay = renderLayer("projects", true, <ProjectsPage />);
        break;
      case "account":
        overlay = renderLayer("account", true, <AccountPage />);
        break;
      case "file-use":
        overlay = renderLayer("file-use", true, <FileUsePage />);
        break;
      case "hosts":
        overlay = renderLayer("hosts", true, <HostsPage />);
        break;
      case "auth":
        overlay = renderLayer("auth", true, <AuthPage />);
        break;
      case "notifications":
        overlay = renderLayer("notifications", true, <NotificationPage />);
        break;
      case "admin":
        overlay = renderLayer("admin", true, <AdminPage />);
        break;
      case undefined:
        overlay = renderLayer(
          "broken",
          true,
          <div>Please click a button on the top tab.</div>,
        );
        break;
    }
  }

  if (overlay == null && project_layers.length === 0) {
    overlay = renderLayer("project-loading", true, renderProjectLoading());
  }

  if (overlay != null) {
    layers.push(overlay);
  }

  return (
    <div className="smc-vfill" style={STACK_CONTAINER_STYLE}>
      {layers}
    </div>
  );
});

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This defines the entire **desktop** Cocalc page layout and brings in
everything on *desktop*, once the user has signed in.
*/

declare var DEBUG: boolean;

import { ProjectsNav } from "../projects/projects-nav";

import { COLORS } from "@cocalc/util/theme";
import { IS_SAFARI, IS_MOBILE, IS_IOS } from "../feature";

import { Button, Navbar, Nav } from "../antd-bootstrap";
import {
  React,
  useActions,
  useEffect,
  useState,
  useTypedRedux,
} from "../app-framework";
import { SiteName } from "../customize";
import { alert_message } from "../alerts";
import { Avatar } from "../account/avatar/avatar";
import { NavTab } from "./nav-tab";
import { Loading } from "../components";
import { ActiveContent } from "./active-content";
import { FullscreenButton } from "./fullscreen-button";
import { VersionWarning, CookieWarning, LocalStorageWarning } from "./warnings";
import { AppLogo } from "./logo";
import { ConnectionInfo } from "./connection-info";
import { ConnectionIndicator } from "./connection-indicator";
import { FileUsePage } from "../file-use/page";
import { NotificationBell } from "./notification-bell";
import openSupportTab from "@cocalc/frontend/support/open";

const HIDE_LABEL_THRESHOLD = 6;
const NAV_HEIGHT = 36;
const NAV_CLASS = "hidden-xs";

const TOP_BAR_STYLE: React.CSSProperties = {
  display: "flex",
  marginBottom: 0,
  width: "100%",
  minHeight: `${NAV_HEIGHT}px`,
  position: "fixed",
  right: 0,
  zIndex: 100,
  borderRadius: 0,
  top: 0,
} as const;

const FILE_USE_STYLE: React.CSSProperties = {
  zIndex: 110,
  marginLeft: "0",
  position: "fixed",
  boxShadow: "0 0 15px #aaa",
  border: "2px solid #ccc",
  top: `${NAV_HEIGHT - 2}px`,
  background: "#fff",
  right: "2em",
  overflowY: "auto",
  overflowX: "hidden",
  fontSize: "10pt",
  padding: "4px",
  borderRadius: "5px",
  width: "50%",
  height: "90%",
} as const;

const PROJECTS_STYLE: React.CSSProperties = {
  whiteSpace: "nowrap",
  float: "right",
  padding: "10px 7px",
} as const;

// ipad and ios have a weird trick where they make the screen
// actually smaller than 100vh and have it be scrollable, even
// when overflow:hidden, which causes massive UI pain to cocalc.
// so in that case we make the page_height less.  Without this
// one little tricky, cocalc is very, very frustrating to use
// on mobile safari. See the million discussions over the years:
// https://liuhao.im/english/2015/05/29/ios-safari-window-height.html
// ...
// https://lukechannings.com/blog/2021-06-09-does-safari-15-fix-the-vh-bug/
let page_height: string =
  IS_MOBILE || IS_SAFARI
    ? `calc(100vh - env(safe-area-inset-bottom) - ${IS_IOS ? 80 : 20}px)`
    : "100vh";

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: page_height, // see note
  width: "100vw",
  overflow: "hidden",
  background: "white",
} as const;

const positionHackHeight = `${NAV_HEIGHT - 4}px`;

export const Page: React.FC = () => {
  const page_actions = useActions("page");

  const open_projects = useTypedRedux("projects", "open_projects");
  const [show_label, set_show_label] = useState<boolean>(true);
  useEffect(() => {
    const next = open_projects.size <= HIDE_LABEL_THRESHOLD;
    if (next != show_label) {
      set_show_label(next);
    }
  }, [open_projects]);

  useEffect(() => {
    return () => {
      page_actions.clear_all_handlers();
    };
  }, []);

  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const show_connection = useTypedRedux("page", "show_connection");
  const show_file_use = useTypedRedux("page", "show_file_use");
  const fullscreen = useTypedRedux("page", "fullscreen");
  const local_storage_warning = useTypedRedux("page", "local_storage_warning");
  const cookie_warning = useTypedRedux("page", "cookie_warning");
  const new_version = useTypedRedux("page", "new_version");

  const account_id = useTypedRedux("account", "account_id");
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const doing_anonymous_setup = useTypedRedux(
    "account",
    "doing_anonymous_setup"
  );
  const when_account_created = useTypedRedux("account", "created");
  const groups = useTypedRedux("account", "groups");

  const is_commercial = useTypedRedux("customize", "is_commercial");

  function render_account_tab(): JSX.Element {
    let a, label, style;
    if (is_anonymous) {
      a = undefined;
    } else if (account_id) {
      a = (
        <Avatar
          size={20}
          account_id={account_id}
          no_tooltip={true}
          no_loading={true}
        />
      );
    } else {
      a = "cog";
    }

    if (is_anonymous) {
      let mesg;
      style = { fontWeight: "bold", opacity: 0 };
      if (
        when_account_created &&
        new Date().valueOf() - when_account_created.valueOf() >= 1000 * 60 * 60
      ) {
        mesg = "Sign Up NOW to avoid losing all of your work!";
        style.width = "400px";
      } else {
        mesg = "Sign Up!";
      }
      label = (
        <Button id="anonymous-sign-up" bsStyle="success" style={style}>
          {mesg}
        </Button>
      );
      style = { marginTop: "-10px" }; // compensate for using a button
      /* We only actually show the button if it is still there a few
        seconds later.  This avoids flickering it for a moment during
        normal sign in.  This feels like a hack, but was super
        quick to implement.
      */
      setTimeout(() => $("#anonymous-sign-up").css("opacity", 1), 3000);
    } else {
      label = "Account";
      style = undefined;
    }

    return (
      <NavTab
        name="account"
        label={label}
        style={style}
        label_class={NAV_CLASS}
        icon={a}
        active_top_tab={active_top_tab}
        hide_label={!show_label}
      />
    );
  }

  function render_admin_tab(): JSX.Element {
    return (
      <NavTab
        name="admin"
        label={"Admin"}
        label_class={NAV_CLASS}
        icon={"users"}
        inner_style={{ padding: "10px", display: "flex" }}
        active_top_tab={active_top_tab}
        hide_label={!show_label}
      />
    );
  }

  function sign_in_tab_clicked() {
    if (active_top_tab === "account") {
      page_actions.sign_in();
    }
  }

  function render_sign_in_tab(): JSX.Element {
    let style;
    if (active_top_tab !== "account") {
      // Strongly encourage clicking on the sign in tab.
      // Especially important if user got signed out due
      // to cookie expiring or being deleted (say).
      style = { backgroundColor: COLORS.TOP_BAR.SIGN_IN_BG, fontSize: "16pt" };
    } else {
      style = undefined;
    }
    return (
      <NavTab
        name="account"
        label="Sign in"
        label_class={NAV_CLASS}
        icon="sign-in"
        inner_style={{ padding: "10px", display: "flex" }}
        on_click={sign_in_tab_clicked}
        active_top_tab={active_top_tab}
        style={style}
        add_inner_style={{ color: "black" }}
        hide_label={!show_label}
      />
    );
  }

  function render_support(): JSX.Element | undefined {
    if (!is_commercial) {
      return;
    }
    // Note: that styled span around the label is just
    // because I'm too lazy to fix this properly, since
    // it's all ancient react bootstrap stuff that will
    // get rewritten.
    return (
      <NavTab
        label={
          <span style={{ paddingTop: "3px", display: "inline-block" }}>
            Help
          </span>
        }
        label_class={NAV_CLASS}
        icon={"medkit"}
        inner_style={{ padding: "10px", display: "flex" }}
        active_top_tab={active_top_tab}
        on_click={openSupportTab}
        hide_label={!show_label}
      />
    );
  }

  function render_bell(): JSX.Element | undefined {
    if (!is_logged_in || is_anonymous) {
      return;
    }
    return <NotificationBell active={show_file_use} />;
  }

  function render_right_nav(): JSX.Element {
    const logged_in = is_logged_in;
    return (
      <Nav
        id="smc-right-tabs-fixed"
        style={{
          height: `${NAV_HEIGHT}px`,
          lineHeight: "20px",
          margin: "0",
          overflowY: "hidden",
        }}
      >
        {logged_in && groups?.includes("admin") && render_admin_tab()}
        {!logged_in && render_sign_in_tab()}
        {render_support()}
        {logged_in && render_account_tab()}
        {render_bell()}
        {!is_anonymous && <ConnectionIndicator />}
      </Nav>
    );
  }

  function render_project_nav_button(): JSX.Element {
    return (
      <Nav
        style={{ height: `${NAV_HEIGHT}px`, margin: "0", overflow: "hidden" }}
      >
        <NavTab
          name={"projects"}
          inner_style={{ padding: "0px" }}
          active_top_tab={active_top_tab}
        >
          {show_label && (
            <div
              style={PROJECTS_STYLE}
              cocalc-test="project-button"
              className={NAV_CLASS}
            >
              Projects
            </div>
          )}
          <AppLogo />
        </NavTab>
      </Nav>
    );
  }

  // register a default drag and drop handler, that prevents
  // accidental file drops
  // TEST: make sure that usual drag'n'drop activities
  // like rearranging tabs and reordering tasks work
  function drop(e) {
    if (DEBUG) {
      e.persist();
    }
    //console.log "react desktop_app.drop", e
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      alert_message({
        type: "info",
        title: "File Drop Rejected",
        message:
          'To upload a file, drop it onto the files listing or the "Drop files to upload" area in the +New tab.',
      });
    }
  }

  if (doing_anonymous_setup) {
    // Don't show the login screen or top navbar for a second
    // while creating their anonymous account, since that
    // would just be ugly/confusing/and annoying.
    // Have to use above style to *hide* the crash warning.
    const loading_anon = (
      <div style={{ margin: "auto", textAlign: "center" }}>
        <h1 style={{ color: COLORS.GRAY }}>
          <Loading />
        </h1>
        <div style={{ color: COLORS.GRAY, width: "50vw" }}>
          Please give <SiteName /> a couple of seconds to start your project and
          prepare a file...
        </div>
      </div>
    );
    return <div style={PAGE_STYLE}>{loading_anon}</div>;
  }

  // Children must define their own padding from navbar and screen borders
  // Note that the parent is a flex container
  return (
    <div
      style={PAGE_STYLE}
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      {show_file_use && (
        <div style={FILE_USE_STYLE} className="smc-vfill">
          <FileUsePage />
        </div>
      )}
      {show_connection && <ConnectionInfo />}
      {new_version && <VersionWarning new_version={new_version} />}
      {cookie_warning && <CookieWarning />}
      {local_storage_warning && <LocalStorageWarning />}
      {!fullscreen && (
        <Navbar className="smc-top-bar" style={TOP_BAR_STYLE}>
          {is_logged_in && render_project_nav_button()}
          <ProjectsNav />
          {render_right_nav()}
        </Navbar>
      )}
      {!fullscreen && <div style={{ minHeight: positionHackHeight }}></div>}
      {fullscreen !== "kiosk" && !is_anonymous && <FullscreenButton />}
      <ActiveContent />
    </div>
  );
};

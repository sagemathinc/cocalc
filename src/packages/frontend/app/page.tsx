/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This defines the entire **desktop** Cocalc page layout and brings in
everything on *desktop*, once the user has signed in.
*/

declare var DEBUG: boolean;

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { alert_message } from "@cocalc/frontend/alerts";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  useActions,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { FileUsePage } from "@cocalc/frontend/file-use/page";
import { ProjectsNav } from "@cocalc/frontend/projects/projects-nav";
import openSupportTab from "@cocalc/frontend/support/open";
import { COLORS } from "@cocalc/util/theme";
import { IS_IOS, IS_MOBILE, IS_SAFARI } from "../feature";
import { ActiveContent } from "./active-content";
import { ConnectionIndicator } from "./connection-indicator";
import { ConnectionInfo } from "./connection-info";
import { FullscreenButton } from "./fullscreen-button";
import { AppLogo } from "./logo";
import { NavTab } from "./nav-tab";
import { Notification } from "./notification-bell";
import { CookieWarning, LocalStorageWarning, VersionWarning } from "./warnings";

// This is not responsive -- but I just need something is actually
// usable on my phone.  TODO: if you load with phone in landscape mode,
// then switch to portrait, this is broken.  But it's better than
// always being 100% broken.
const IS_PHONE =
  IS_MOBILE && window.innerWidth != null && window.innerWidth <= 480;

const HIDE_LABEL_THRESHOLD = 6;
const NAV_HEIGHT_NARROW = 36;
const NAV_HEIGHT = IS_PHONE ? 72 : NAV_HEIGHT_NARROW;
const NAV_CLASS = "hidden-xs";

const TOP_BAR_STYLE: CSS = {
  minHeight: `${NAV_HEIGHT}px`,
} as const;

const FILE_USE_STYLE: CSS = {
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

// ipad and ios have a weird trick where they make the screen
// actually smaller than 100vh and have it be scrollable, even
// when overflow:hidden, which causes massive UI pain to cocalc.
// so in that case we make the page_height less.  Without this
// one little tricky, cocalc is very, very frustrating to use
// on mobile safari. See the million discussions over the years:
// https://liuhao.im/english/2015/05/29/ios-safari-window-height.html
// ...
// https://lukechannings.com/blog/2021-06-09-does-safari-15-fix-the-vh-bug/
const PAGE_HEIGHT: string =
  IS_MOBILE || IS_SAFARI
    ? `calc(100vh - env(safe-area-inset-bottom) - ${IS_IOS ? 80 : 20}px)`
    : "100vh";

const PAGE_STYLE: CSS = {
  display: "flex",
  flexDirection: "column",
  height: PAGE_HEIGHT, // see note
  width: "100vw",
  overflow: "hidden",
  background: "white",
} as const;

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

  function account_tab_icon(): IconName | JSX.Element {
    if (is_anonymous) {
      return <></>;
    } else if (account_id) {
      return (
        <Avatar
          size={20}
          account_id={account_id}
          no_tooltip={true}
          no_loading={true}
        />
      );
    } else {
      return "cog";
    }
  }

  function render_account_tab(): JSX.Element {
    const icon = account_tab_icon();
    let label, style;
    if (is_anonymous) {
      let mesg;
      style = { fontWeight: "bold", opacity: 0 };
      if (
        when_account_created &&
        Date.now() - when_account_created.valueOf() >= 1000 * 60 * 60
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
      style = { marginTop: "-8px" }; // compensate for using a button
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
        icon={icon}
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
        name={undefined} // does not open a tab, just a popup
        active_top_tab={active_top_tab} // it's never supposed to be active!
        label={"Help"}
        label_class={NAV_CLASS}
        icon={"medkit"}
        on_click={openSupportTab}
        hide_label={!show_label}
      />
    );
  }

  function render_bell(): JSX.Element | undefined {
    if (!is_logged_in || is_anonymous) return;
    return <Notification type="bell" active={show_file_use} />;
  }

  function render_messages(): JSX.Element | undefined {
    if (!is_logged_in || is_anonymous) return;
    return <Notification type="mentions" active={show_mentions} />;
  }

  function render_right_nav(): JSX.Element {
    const logged_in = is_logged_in;
    return (
      <div
        className="smc-right-tabs-fixed"
        style={{
          display: "flex",
          flex: "0 0 auto",
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
        {render_messages()}
        {render_bell()}
        {!is_anonymous && <ConnectionIndicator height={NAV_HEIGHT_NARROW} />}
      </div>
    );
  }

  function render_project_nav_button(): JSX.Element {
    return (
      <NavTab
        style={{ height: `${NAV_HEIGHT}px`, margin: "0", overflow: "hidden" }}
        name={"projects"}
        active_top_tab={active_top_tab}
        tooltip="Show all the projects on which you collaborate."
        icon="edit"
        label="Projects"
      />
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
        <nav className="smc-top-bar" style={TOP_BAR_STYLE}>
          <AppLogo />
          {is_logged_in && render_project_nav_button()}
          <ProjectsNav
            height={NAV_HEIGHT_NARROW}
            style={
              IS_PHONE && {
                /* this makes it so the projects tabs are on a separate row; otherwise, there is literally no room for them at all... */
                top: "32px",
                left: 0,
                position: "absolute",
                width: "100vw",
              }
            }
          />
          {render_right_nav()}
        </nav>
      )}
      {!is_anonymous && <FullscreenButton />}
      <ActiveContent />
    </div>
  );
};

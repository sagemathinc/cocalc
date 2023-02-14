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
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { IconName } from "@cocalc/frontend/components/icon";
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
import { Notification } from "./notifications";
import {
  FONT_SIZE_ICONS_NARROW,
  FONT_SIZE_ICONS_NORMAL,
  HIDE_LABEL_THRESHOLD,
  NARROW_THRESHOLD_PX,
  NAV_CLASS,
  NAV_HEIGHT_NARROW_PX,
  NAV_HEIGHT_PX,
  PageStyle,
} from "./top-nav-consts";
import { CookieWarning, LocalStorageWarning, VersionWarning } from "./warnings";

function calcStyle(isNarrow: boolean): PageStyle {
  const fontSizeIcons: string = isNarrow
    ? FONT_SIZE_ICONS_NARROW
    : FONT_SIZE_ICONS_NORMAL;
  const topPaddingIcons: string = isNarrow ? "5px" : "5px";
  const sidePaddingIcons: string = isNarrow ? "7px" : "14px";

  const height = isNarrow ? NAV_HEIGHT_NARROW_PX : NAV_HEIGHT_PX;

  const topBarStyle: CSS = {
    height: `${height}px`,
  } as const;

  const fileUseStyle: CSS = {
    background: "white",
    border: `2px solid ${COLORS.GRAY_DDD}`,
    borderRadius: "5px",
    boxShadow: "0 0 15px #aaa",
    fontSize: "10pt",
    height: "90%",
    margin: 0,
    overflowX: "hidden",
    overflowY: "auto",
    padding: "4px",
    position: "fixed",
    right: "5vw",
    top: `${height}px`,
    width: isNarrow ? "90vw" : "50vw",
    zIndex: 110,
  } as const;

  const projectsNavStyle: CSS | undefined = isNarrow
    ? {
        /* this makes it so the projects tabs are on a separate row; otherwise, there is literally no room for them at all... */
        width: "100vw",
        marginTop: "4px",
        height: `${height}px`,
        // no flex!
      }
    : {
        flex: "1 1 auto", // necessary to stretch out to the full width
      };

  return {
    topBarStyle,
    fileUseStyle,
    projectsNavStyle,
    isNarrow,
    sidePaddingIcons,
    topPaddingIcons,
    fontSizeIcons,
    height,
  };
}

function isNarrow(): boolean {
  return window.innerWidth != null && window.innerWidth <= NARROW_THRESHOLD_PX;
}

function usePageStyle(): PageStyle {
  //const [style, setStyle] = useState<PageStyle>(calcStyle(narrow()));

  const [narrow, setNarrow] = useState<boolean>(isNarrow());

  useEffect(() => {
    const handleResize = () => {
      setNarrow(isNarrow());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // avoid updating the style on every resize event
  return useMemo(() => {
    return calcStyle(narrow);
  }, [narrow]);
}

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

  const pageStyle = usePageStyle();
  const { isNarrow, fileUseStyle, topBarStyle, projectsNavStyle } = pageStyle;

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
  const show_mentions = active_top_tab === "notifications";
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

  function render_admin_tab(): JSX.Element | undefined {
    if (is_logged_in && groups?.includes("admin")) {
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
  }

  function sign_in_tab_clicked() {
    if (active_top_tab === "account") {
      page_actions.sign_in();
    }
  }

  function render_sign_in_tab(): JSX.Element | null {
    if (is_logged_in) return null;

    let style: CSS | undefined = undefined;
    if (active_top_tab !== "account") {
      // Strongly encourage clicking on the sign in tab.
      // Especially important if user got signed out due
      // to cookie expiring or being deleted (say).
      style = { backgroundColor: COLORS.TOP_BAR.SIGN_IN_BG, fontSize: "16pt" };
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
    return (
      <Notification type="bell" active={show_file_use} pageStyle={pageStyle} />
    );
  }

  function render_mentions(): JSX.Element | undefined {
    if (!is_logged_in || is_anonymous) return;
    return (
      <Notification
        type="mentions"
        active={show_mentions}
        pageStyle={pageStyle}
      />
    );
  }

  function render_fullscreen(): JSX.Element | undefined {
    if (isNarrow || is_anonymous) return;

    return <FullscreenButton pageStyle={pageStyle} />;
  }

  function render_right_nav(): JSX.Element {
    return (
      <div
        className="smc-right-tabs-fixed"
        style={{
          display: "flex",
          flex: "0 0 auto",
          height: `${pageStyle.height}px`,
          margin: "0",
          overflowY: "hidden",
          alignItems: "center",
        }}
      >
        {render_admin_tab()}
        {render_sign_in_tab()}
        {render_support()}
        {is_logged_in && render_account_tab()}
        {render_mentions()}
        {render_bell()}
        {!is_anonymous && (
          <ConnectionIndicator
            height={pageStyle.height}
            pageStyle={pageStyle}
          />
        )}
        {render_fullscreen()}
      </div>
    );
  }

  function render_project_nav_button(): JSX.Element {
    return (
      <NavTab
        style={{
          height: `${pageStyle.height}px`,
          margin: "0",
          overflow: "hidden",
        }}
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
        <div style={fileUseStyle} className="smc-vfill">
          <FileUsePage />
        </div>
      )}
      {show_connection && <ConnectionInfo />}
      {new_version && <VersionWarning new_version={new_version} />}
      {cookie_warning && <CookieWarning />}
      {local_storage_warning && <LocalStorageWarning />}
      {!fullscreen && (
        <nav className="smc-top-bar" style={topBarStyle}>
          <AppLogo size={pageStyle.height} />
          {is_logged_in && render_project_nav_button()}
          {!isNarrow ? (
            <ProjectsNav height={pageStyle.height} style={projectsNavStyle} />
          ) : (
            // we need an expandable placeholder, otherwise the right-nav-buttons won't align to the right
            <div style={{ flex: "1 1 auto" }} />
          )}
          {render_right_nav()}
        </nav>
      )}
      {fullscreen && render_fullscreen()}
      {isNarrow && (
        <ProjectsNav height={pageStyle.height} style={projectsNavStyle} />
      )}
      <ActiveContent />
    </div>
  );
};

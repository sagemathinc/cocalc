/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
A single tab in a project.
   - There is one of these for each open file in a project.
   - There is ALSO one for each of the fixed tabs -- files, new, log, search, settings.
*/

// cSpell:ignore fixedtab popout Collabs

import { Popover, Tag, Tooltip } from "antd";
import { CSSProperties, ReactNode } from "react";
import { defineMessage, useIntl } from "react-intl";

import { getAlertName } from "@cocalc/comm/project-status/types";
import {
  CSS,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, r_join } from "@cocalc/frontend/components";
import ComputeServerSpendRate from "@cocalc/frontend/compute/spend-rate";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { IntlMessage, isIntlMessage, labels } from "@cocalc/frontend/i18n";
import {
  ICON_UPGRADES,
  ICON_USERS,
} from "@cocalc/frontend/project/servers/consts";
import { PayAsYouGoCost } from "@cocalc/frontend/project/settings/quota-editor/pay-as-you-go";
import track from "@cocalc/frontend/user-tracking";
import { filename_extension, path_split, path_to_tab } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../context";
import { TITLE as SERVERS_TITLE } from "../servers";
import {
  CollabsFlyout,
  FilesFlyout,
  LicensesFlyout,
  LogFlyout,
  NewFlyout,
  ProjectInfoFlyout,
  SearchFlyout,
  ServersFlyout,
  SettingsFlyout,
} from "./flyouts";
import { ActiveFlyout } from "./flyouts/active";
import { shouldOpenFileInNewWindow } from "./utils";
import { getValidActivityBarOption } from "./activity-bar";
import { ACTIVITY_BAR_KEY } from "./activity-bar-consts";

const { file_options } = require("@cocalc/frontend/editor");

export type FixedTab =
  | "active"
  | "files"
  | "new"
  | "log"
  | "search"
  | "servers"
  | "settings"
  | "info"
  | "users"
  | "upgrades";

export function isFixedTab(tab?: any): tab is FixedTab {
  return typeof tab === "string" && tab in FIXED_PROJECT_TABS;
}

type FixedTabs = {
  [name in FixedTab]: {
    label: string | ReactNode | IntlMessage;
    icon: IconName;
    flyout: (props: {
      project_id: string;
      wrap: (content: React.JSX.Element, style?: CSS) => React.JSX.Element;
      flyoutWidth: number;
    }) => React.JSX.Element;
    flyoutTitle?: string | ReactNode | IntlMessage;
    noAnonymous?: boolean;
    noFullPage?: boolean; // if true, then this tab can't be opened in a full page
  };
};

// TODO/NOTE: for better or worse I just can't stand the tooltips on the activity bar!
// Disabling them.  If anyone complaints or likes them, I can make them an option.

export const FIXED_PROJECT_TABS: FixedTabs = {
  active: {
    label: labels.tabs,
    flyoutTitle: "File Tabs",
    icon: "edit",
    flyout: ActiveFlyout,
    noAnonymous: false,
    noFullPage: true,
  },
  files: {
    label: labels.explorer,
    icon: "folder-open",
    flyout: FilesFlyout,
    noAnonymous: false,
  },
  new: {
    label: labels.new,
    flyoutTitle: defineMessage({
      id: "project.page.flyout.new_file.title",
      defaultMessage: "Create New",
    }),
    icon: "plus-circle",
    flyout: NewFlyout,
    noAnonymous: false,
  },
  log: {
    label: labels.log,
    icon: "history",
    flyout: LogFlyout,
    flyoutTitle: defineMessage({
      id: "project.page.flyout.log.title",
      defaultMessage: "Recent Files",
    }),
    noAnonymous: false,
  },
  search: {
    label: defineMessage({
      id: "project.page.file-tab.search_file.label",
      defaultMessage: "Find",
    }),
    icon: "search",
    flyout: SearchFlyout,
    noAnonymous: false,
  },
  servers: {
    label: SERVERS_TITLE,
    icon: "server",
    flyout: ServersFlyout,
    noAnonymous: false,
  },
  users: {
    label: labels.users,
    icon: ICON_USERS,
    flyout: CollabsFlyout,
    noAnonymous: false,
  },
  upgrades: {
    label: labels.upgrades,
    icon: ICON_UPGRADES,
    flyout: LicensesFlyout,
    flyoutTitle: defineMessage({
      id: "project.page.file-tab.upgrades.flyoutTitle",
      defaultMessage: `Project Upgrades`,
    }),
    noAnonymous: false,
  },
  info: {
    label: labels.project_info_title,
    icon: "microchip",
    flyout: ProjectInfoFlyout,
    noAnonymous: false,
  },
  settings: {
    label: labels.settings,
    icon: "wrench",
    flyout: SettingsFlyout,
    noAnonymous: false,
    flyoutTitle: defineMessage({
      id: "project.page.flyout.settings.title",
      defaultMessage: "Status and Settings",
    }),
  },
} as const;

interface Props0 {
  project_id: string;
  label?: string;
  style?: CSSProperties;
  noPopover?: boolean;
  placement?;
  iconStyle?: CSSProperties;
  extraSpacing?: string; // around main div and caret
  isFixedTab?: boolean;
  flyout?: FixedTab;
  condensed?: boolean;
  showLabel?: boolean; // only relevant for the vertical activity bar. still showing alert tags!
  // ARIA attributes for tab semantics
  role?: string;
  "aria-selected"?: boolean;
  "aria-controls"?: string;
}
interface PropsPath extends Props0 {
  path: string;
  name?: undefined;
}
interface PropsName extends Props0 {
  path?: undefined;
  name: string;
}
type Props = PropsPath | PropsName;

export function FileTab(props: Readonly<Props>) {
  const {
    project_id,
    path,
    name,
    label: label_prop,
    isFixedTab,
    flyout = null,
    condensed = false,
    showLabel = true,
  } = props;
  let label = label_prop; // label modified below in some situations
  const actions = useActions({ project_id });
  const intl = useIntl();
  const { onCoCalcDocker } = useProjectContext();
  // this is @cocalc/comm/project-status/types::ProjectStatus
  const project_status = useTypedRedux({ project_id }, "status");
  // alerts only work on non-docker projects (for now) -- #7077
  const status_alerts: string[] =
    !onCoCalcDocker && name === "info"
      ? (project_status
          ?.get("alerts")
          ?.map((a) => a.get("type"))
          .toJS() ?? [])
      : [];

  const other_settings = useTypedRedux("account", "other_settings");
  const active_flyout = useTypedRedux({ project_id }, "flyout");
  const actBar = getValidActivityBarOption(
    other_settings.get(ACTIVITY_BAR_KEY),
  );

  // True if there is activity (e.g., active output) in this tab
  const has_activity = useRedux(
    ["open_files", path ?? "", "has_activity"],
    project_id,
  );

  function closeFile() {
    if (path == null || actions == null) return;
    actions.close_tab(path);
  }

  function setActiveTab(name: string) {
    actions?.set_active_tab(name);
    track("switch-to-fixed-tab", {
      project_id,
      name,
      how: "click-on-tab",
    });
  }

  function click(e: React.MouseEvent) {
    e.stopPropagation();
    if (actions == null) return;
    const anyModifierKey = shouldOpenFileInNewWindow(e);
    if (path != null) {
      if (anyModifierKey) {
        // shift/ctrl/option clicking on *file* tab opens in a new popout window.
        actions.open_file({
          path,
          new_browser_window: true,
        });
        track("open-file-in-new-window", {
          path,
          project_id,
          how: "shift-ctrl-meta-click-on-tab",
        });
      } else {
        actions.set_active_tab(path_to_tab(path));
        track("switch-to-file-tab", {
          project_id,
          path,
          how: "click-on-tab",
        });
      }
    } else if (name != null) {
      if (flyout != null && FIXED_PROJECT_TABS[flyout].noFullPage) {
        // this tab can't be opened in a full page
        actions?.toggleFlyout(flyout);
      } else if (flyout != null && actBar !== "both") {
        if (anyModifierKey !== (actBar === "full")) {
          setActiveTab(name);
        } else {
          actions?.toggleFlyout(flyout);
        }
      } else {
        setActiveTab(name);
      }
    }
  }

  // middle mouse click closes – onMouseUp is important, because otherwise the clipboard buffer is inserted (on Linux)
  function onMouseUp(e) {
    if (e.button === 1) {
      e.stopPropagation();
      e.preventDefault();
      closeFile();
    }
  }

  function renderFlyoutCaret() {
    if (flyout == null || actBar !== "both") return;

    const color =
      flyout === active_flyout
        ? COLORS.PROJECT.FIXED_LEFT_ACTIVE
        : active_flyout == null
          ? COLORS.GRAY_L
          : COLORS.GRAY_L0;
    const bg = flyout === active_flyout ? COLORS.GRAY_L0 : undefined;

    return (
      <div
        className="cc-project-fixedtab"
        style={{
          display: "flex",
          alignItems: "center",
          color,
          backgroundColor: bg,
        }}
        onClick={(e) => {
          e.stopPropagation();
          actions?.toggleFlyout(flyout);
        }}
      >
        <Icon
          style={{
            padding: "0 3px",
            margin: "0",
            color,
          }}
          name="caret-right"
        />
      </div>
    );
  }

  let style: CSSProperties;
  if (path != null) {
    style = {};
  } else {
    // highlight info tab if there is at least one alert
    if (status_alerts.length > 0) {
      style = { backgroundColor: COLORS.ANTD_BG_RED_L };
    } else {
      style = { flex: "none" };
    }
  }

  // how to read: default color -> style for component -> override color if there is activity
  const icon_style: CSSProperties = {
    marginRight: "2px",
    color: COLORS.FILE_ICON,
    ...props.iconStyle,
    ...(has_activity ? { color: "orange" } : undefined),
  };

  if (label == null) {
    if (name != null) {
      label = FIXED_PROJECT_TABS[name].label;
      if (isIntlMessage(label)) {
        label = intl.formatMessage(label);
      }
    } else if (path != null) {
      label = path_split(path).tail;
    }
  }

  if (label == null) throw Error("label must not be null");

  const icon =
    path != null
      ? (file_options(path)?.icon ?? "code-o")
      : FIXED_PROJECT_TABS[name!].icon;

  const tags =
    status_alerts.length > 0 ? (
      <div>
        {r_join(
          status_alerts.map((a) => (
            <Tag
              key={a}
              style={{
                display: "inline",
                fontSize: "85%",
                paddingInline: "2px",
                marginInlineEnd: "4px",
              }}
              color={COLORS.ANTD_BG_RED_M}
            >
              {getAlertName(a)}
            </Tag>
          )),
          <br />,
        )}
      </div>
    ) : undefined;

  function renderFixedTab() {
    const button = (
      <div
        className="cc-project-fixedtab"
        style={{
          textAlign: "center",
          width: "100%",
          paddingLeft: "8px",
          paddingRight: "8px",
          paddingTop: props.extraSpacing ?? "0",
          paddingBottom: props.extraSpacing ?? "0",
        }}
      >
        {btnLeft}
      </div>
    );
    if (isFixedTab && !showLabel && !other_settings.get("hide_file_popovers")) {
      return (
        <Tooltip title={label} placement="right" mouseEnterDelay={1}>
          {button}
        </Tooltip>
      );
    } else {
      return button;
    }
  }

  const btnLeft = (
    <>
      <Icon
        style={{
          display: condensed ? "inline-block" : undefined,
          ...icon_style,
        }}
        name={icon}
      />
      {showLabel ? (
        <DisplayedLabel
          path={path}
          label={label}
          inline={!isFixedTab}
          project_id={project_id}
        />
      ) : null}
      {tags}
    </>
  );

  const inner = !isFixedTab ? (
    btnLeft
  ) : (
    <div
      style={{
        display: "flex",
        flex: "1 0 auto",
        justifyContent: "space-between",
      }}
    >
      {renderFixedTab()}
      {renderFlyoutCaret()}
    </div>
  );

  const body = (
    <div
      style={{
        ...style,
        ...props.style,
      }}
      cocalc-test={label}
      onClick={click}
      onMouseUp={onMouseUp}
      role={props.role}
      aria-selected={props["aria-selected"]}
      aria-controls={props["aria-controls"]}
    >
      <div
        style={{
          width: "100%",
          cursor: "pointer",
          display: path != null ? "flex" : undefined,
          textAlign: "center",
        }}
      >
        {inner}
      </div>
    </div>
  );

  // in pure "full page" vbar mode, do not show a vertical tab, which has no fullpage
  if (
    actBar === "full" &&
    flyout != null &&
    FIXED_PROJECT_TABS[flyout].noFullPage
  ) {
    return null;
  }

  if (
    props.noPopover ||
    IS_MOBILE ||
    isFixedTab ||
    (!isFixedTab && other_settings.get("hide_file_popovers"))
  ) {
    return body;
  }
  // The ! after name is needed since TS doesn't infer that if path is null then name is not null,
  // though our union type above guarantees this.
  return (
    <Popover
      zIndex={10000}
      title={() => {
        if (path != null) {
          return <b>{path}</b>;
        }
        const { tooltip } = FIXED_PROJECT_TABS[name!];
        if (tooltip == null) return <b>{name}</b>;
        if (typeof tooltip == "string") {
          return <b>{tooltip}</b>;
        }
        return tooltip({ project_id });
      }}
      content={
        // only editor-tabs can pop up
        !isFixedTab ? (
          <span style={{ color: COLORS.GRAY }}>
            Hint: Shift+click to open in new window.
          </span>
        ) : undefined
      }
      mouseEnterDelay={1}
      placement={props.placement ?? "bottom"}
    >
      {body}
    </Popover>
  );
}

const LABEL_STYLE: CSS = {
  overflow: "hidden",
  //textOverflow: "ellipsis",
  margin: "auto",
  whiteSpace: "nowrap",
} as const;

const FULLPATH_LABEL_STYLE: CSS = {
  // using a full path for the label instead of just a filename
  textOverflow: "ellipsis",
  // so the ellipsis are on the left side of the path, which is most useful
  direction: "rtl",
  padding: "0 1px", // need less since have ..
} as const;

function DisplayedLabel({ path, label, inline = true, project_id }) {
  if (path == null) {
    // a fixed tab (not an actual file)
    const E = inline ? "span" : "div";
    const style: CSS = {
      // disabled because condensed state is buggy -- both andrey and I have frequently
      // complained about it getting stuck small. Also, the width doesn't change so all
      // you get from this is small hard to read text and slightly more vertical buttons,
      // but there is vertical scroll, so not needed.
      //fontSize: condensed ? "10px" : "12px",
      fontSize: "12px",
      textAlign: "center",
      maxWidth: "65px",
      overflow: "hidden",
      textOverflow: "ellipsis", // important for i18n, since sometimes the words are long
    };
    return (
      <>
        <E style={style}>{label}</E>
        {label == FIXED_PROJECT_TABS.upgrades.label && (
          <PayAsYouGoCost project_id={project_id} />
        )}
        {label == FIXED_PROJECT_TABS.servers.label && (
          <ComputeServerSpendRate project_id={project_id} />
        )}
      </>
    );
  }

  let ext = filename_extension(label);
  if (ext) {
    ext = "." + ext;
    label = label.slice(0, -ext.length);
  }
  // The "ltr" below is needed because of the direction 'rtl' in label_style, which
  // we have to compensate for in some situations, e.g., a file name "this is a file!"
  // will have the ! moved to the beginning by rtl.
  return (
    <div
      style={{
        ...LABEL_STYLE,
        ...(label.includes("/") ? FULLPATH_LABEL_STYLE : undefined),
      }}
    >
      <span style={{ direction: "ltr" }}>
        {label}
        <span style={{ color: COLORS.FILE_EXT }}>{ext}</span>
      </span>
    </div>
  );
}

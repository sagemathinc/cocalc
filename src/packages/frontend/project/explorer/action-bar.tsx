/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space, Tooltip } from "antd";
import * as immutable from "immutable";
import React from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import { Icon } from "@cocalc/frontend/components";
import { ClipboardPill } from "@cocalc/frontend/file-clipboard/clipboard-pill";
import { useFileClipboard } from "@cocalc/frontend/file-clipboard/hook";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { CustomSoftwareInfo } from "@cocalc/frontend/custom-software/info-bar";
import { ComputeImages } from "@cocalc/frontend/custom-software/init";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import ExplorerHelp from "@cocalc/frontend/project/explorer/explorer-help";
import { isTerminalMode } from "@cocalc/frontend/project/explorer/file-listing";
import { RefreshButton } from "@cocalc/frontend/project/explorer/refresh-button";
import type { FileAction } from "@cocalc/frontend/project_actions";
import { FILE_ACTIONS, ProjectActions } from "@cocalc/frontend/project_actions";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const ROW_INFO_STYLE = {
  color: "var(--cocalc-text-primary-strong, #333333)",
  height: "22px",
  margin: "5px 3px",
} as const;

/** Shared style for the "active filter" badge buttons.
 *  Used in both the explorer info line and the empty-placeholder. */
export const ACTIVE_FILTER_BTN_STYLE: React.CSSProperties = {
  background: "var(--cocalc-warning, #ffbb96)",
  color: "var(--cocalc-text-primary, black)",
  borderRadius: 4,
  whiteSpace: "nowrap",
  marginLeft: 6,
};

/** Green-tinted badge for additive indicators (something is shown, not filtered). */
const ACTIVE_ADDITIVE_BTN_STYLE: React.CSSProperties = {
  background: "var(--cocalc-success, #87d068)",
  color: "var(--cocalc-text-primary, black)",
  borderRadius: 4,
  whiteSpace: "nowrap",
  marginLeft: 6,
};

interface Props {
  project_id?: string;
  checked_files: immutable.Set<string>;
  listing: { name: string; isdir: boolean }[];
  current_path?: string;
  project_map?: immutable.Map<string, string>;
  images?: ComputeImages;
  actions: ProjectActions;
  available_features?;
  show_custom_software_reset?: boolean;
  project_is_running?: boolean;
  show_directory_tree?: boolean;
  on_toggle_directory_tree?: () => void;
}

export const ActionBar: React.FC<Props> = (props: Props) => {
  const intl = useIntl();
  const student_project_functionality = useStudentProjectFunctionality(
    props.actions.project_id,
  );
  const disableActions = student_project_functionality.disableActions;

  // When file actions are disabled (student projects), still render the
  // directory tree toggle — it is navigation, not a file action.
  if (disableActions) {
    if (
      !props.on_toggle_directory_tree ||
      props.show_directory_tree ||
      IS_MOBILE
    ) {
      return <div></div>;
    }
    return (
      <div style={{ padding: "0" }}>
        <BootstrapButton
          onClick={props.on_toggle_directory_tree}
          title="Show directory tree"
        >
          <Icon name="network" style={{ transform: "rotate(270deg)" }} />
        </BootstrapButton>
      </div>
    );
  }

  function clear_selection(): void {
    props.actions.set_all_files_unchecked();
  }

  function check_all_click_handler(): void {
    if (props.checked_files.size === 0) {
      props.actions.set_file_list_checked(
        props.listing.map((file) =>
          misc.path_to_file(props.current_path ?? "", file.name),
        ),
      );
    } else {
      clear_selection();
    }
  }

  function render_check_all_button(): React.JSX.Element | undefined {
    const empty = props.listing.length === 0;
    const checked = props.checked_files.size > 0;
    const button_text = intl.formatMessage(
      {
        id: "project.explorer.action-bar.check_all.button",
        defaultMessage: `{checked, select, true {Uncheck All} other {Check All}}`,
        description:
          "For checking all checkboxes to select all files in a listing.",
      },
      { checked },
    );

    let button_icon;
    if (props.checked_files.size === 0) {
      button_icon = "square-o";
    } else {
      if (props.checked_files.size >= props.listing.length) {
        button_icon = "check-square-o";
      } else {
        button_icon = "minus-square-o";
      }
    }

    return (
      <Button
        data-cocalc-test="check-all"
        onClick={check_all_click_handler}
        disabled={empty}
      >
        <Icon name={button_icon} /> {button_text}
      </Button>
    );
  }

  function render_directory_tree_toggle(): React.JSX.Element | undefined {
    // When the tree is visible, the toggle is rendered above the tree panel
    // in explorer.tsx — don't duplicate it here. Tree is also not available
    // on mobile.
    if (
      !props.on_toggle_directory_tree ||
      props.show_directory_tree ||
      IS_MOBILE
    ) {
      return;
    }
    return (
      <BootstrapButton
        onClick={props.on_toggle_directory_tree}
        title="Show directory tree"
      >
        <Icon name="network" style={{ transform: "rotate(270deg)" }} />
      </BootstrapButton>
    );
  }

  function render_action_button(name: FileAction): React.JSX.Element {
    const disabled =
      isDisabledSnapshots(name) &&
      (props.current_path?.startsWith(".snapshots") ?? false);
    const obj = FILE_ACTIONS[name];
    const handle_click = (_e: React.MouseEvent) => {
      props.actions.set_file_action(name);
    };

    return (
      <Tooltip title={intl.formatMessage(obj.name)} key={name}>
        <Button onClick={handle_click} disabled={disabled}>
          <Icon name={obj.icon} />
        </Button>
      </Tooltip>
    );
  }

  function render_action_buttons(): React.JSX.Element | undefined {
    let action_buttons: (
      | "download"
      | "compress"
      | "delete"
      | "rename"
      | "duplicate"
      | "move"
      | "copy"
      | "share"
    )[];
    if (!props.project_is_running) {
      return;
    }
    if (props.checked_files.size === 0) {
      return;
    } else if (props.checked_files.size === 1) {
      let isdir;
      const item = props.checked_files.first();
      for (const file of props.listing) {
        if (misc.path_to_file(props.current_path ?? "", file.name) === item) {
          ({ isdir } = file);
        }
      }

      if (isdir) {
        // one directory selected
        action_buttons = [...ACTION_BUTTONS_DIR];
      } else {
        // one file selected
        action_buttons = [...ACTION_BUTTONS_FILE];
      }
    } else {
      // multiple items selected
      action_buttons = [...ACTION_BUTTONS_MULTI];
    }
    return (
      <Space.Compact>
        {action_buttons.map((v) => render_action_button(v))}
      </Space.Compact>
    );
  }

  function render_button_area(): React.JSX.Element | undefined {
    if (props.checked_files.size === 0) {
      if (
        props.project_id == null ||
        props.images == null ||
        props.project_map == null ||
        props.available_features == null
      ) {
        return;
      }
      return (
        <Space.Compact>
          <CustomSoftwareInfo
            project_id={props.project_id}
            images={props.images}
            project_map={props.project_map}
            actions={props.actions}
            available_features={props.available_features}
            show_custom_software_reset={!!props.show_custom_software_reset}
            project_is_running={!!props.project_is_running}
          />
        </Space.Compact>
      );
    } else {
      return render_action_buttons();
    }
  }
  if (props.checked_files.size === 0 && IS_MOBILE) {
    return null;
  }
  return (
    <Space wrap style={{ whiteSpace: "nowrap", padding: "0" }}>
      {props.project_is_running ? render_directory_tree_toggle() : undefined}
      {props.project_is_running ? render_check_all_button() : undefined}
      {render_button_area()}
    </Space>
  );
};

/** Info line shown below the action bar — "N items" + Help button. */
export const ActionBarInfo: React.FC<
  Pick<
    Props,
    | "project_id"
    | "checked_files"
    | "listing"
    | "project_is_running"
    | "actions"
  > & {
    type_filter?: string;
    file_search?: string;
    hide_masked_files?: boolean;
    show_hidden?: boolean;
    /** The project-wide current_path (active file context). */
    current_path?: string;
    /** The explorer's own browsing path (may differ from current_path). */
    explorer_browsing_path?: string;
    /** Called to switch the explorer to current_path. */
    onSwitchToCurrentPath?: () => void;
    /** True when a filesystem update is buffered and awaiting user confirmation. */
    hasPendingUpdate?: boolean;
    /** Flush the buffered listing update. */
    onRefreshListing?: () => void;
  }
> = (props) => {
  const intl = useIntl();
  const { mode: clipboardMode } = useFileClipboard();
  if (!props.project_is_running) {
    return null;
  }
  const checked = props.checked_files.size;
  const total = props.listing.length;
  const hasClipboard = clipboardMode != null;

  const helpButton = props.project_id ? (
    <ExplorerHelp project_id={props.project_id} />
  ) : null;

  // "Switch" button: shown when the explorer's browsing path differs
  // from the project-wide current_path (active file context).
  const pathsDiverge =
    props.current_path != null &&
    props.explorer_browsing_path != null &&
    props.current_path !== props.explorer_browsing_path;
  const switchButton = pathsDiverge ? (
    <Tooltip
      title={`Switch to the directory of the currently active file: ${props.current_path || "Home"}`}
    >
      <Button
        type="text"
        size="small"
        style={{ color: "var(--cocalc-link, #1677ff)" }}
        onClick={props.onSwitchToCurrentPath}
      >
        <Icon name="swap" /> Switch
      </Button>
    </Tooltip>
  ) : null;

  // Build filter badge list
  const filterBadges: React.ReactNode[] = [];

  if (props.type_filter != null) {
    const ext = props.type_filter;
    const displayName =
      ext === "folder"
        ? intl.formatMessage(labels.folder)
        : (file_options(`file.${ext}`)?.name ?? `.${ext}`);
    filterBadges.push(
      <Button
        key="type"
        type="text"
        size="small"
        style={ACTIVE_FILTER_BTN_STYLE}
        onClick={() =>
          props.actions.setState({ type_filter: undefined } as any)
        }
      >
        {displayName} <Icon name="times-circle" />
      </Button>,
    );
  }

  // Show search filter badge only for file filters, not terminal mode (! or /).
  if (props.file_search && !isTerminalMode(props.file_search)) {
    filterBadges.push(
      <Button
        key="search"
        type="text"
        size="small"
        style={ACTIVE_FILTER_BTN_STYLE}
        onClick={() => props.actions.set_file_search("")}
      >
        Contains &ldquo;{props.file_search}&rdquo; <Icon name="times-circle" />
      </Button>,
    );
  }

  if (props.hide_masked_files) {
    filterBadges.push(
      <Button
        key="mask"
        type="text"
        size="small"
        style={ACTIVE_FILTER_BTN_STYLE}
        onClick={() => props.actions.setState({ hide_masked_files: false })}
      >
        Masked files <Icon name="times-circle" />
      </Button>,
    );
  }

  // Additive indicator: hidden files are being shown (green = adding, not filtering)
  if (props.show_hidden) {
    filterBadges.push(
      <Button
        key="hidden"
        type="text"
        size="small"
        style={ACTIVE_ADDITIVE_BTN_STYLE}
        onClick={() => props.actions.setState({ show_hidden: false })}
      >
        Hidden files <Icon name="times-circle" />
      </Button>,
    );
  }

  const hasFilter = filterBadges.length > 0;

  const refreshButton = props.hasPendingUpdate ? (
    <RefreshButton onClick={props.onRefreshListing} />
  ) : null;

  // When clipboard is active or files are checked, always show "N of M selected"
  // to keep the layout stable (no jumping pills).
  const showSelectionCount = checked > 0 || hasClipboard;

  return (
    <div
      style={{
        ...ROW_INFO_STYLE,
        display: "flex",
        alignItems: "center",
      }}
    >
      <span style={{ flex: 1 }}>
        {showSelectionCount
          ? intl.formatMessage(
              {
                id: "project.explorer.action-bar.currently_selected.items",
                defaultMessage: "{checked} of {total} {items} selected",
              },
              {
                checked,
                total,
                items: intl.formatMessage(labels.item_plural, { total }),
              },
            )
          : `${total} ${intl.formatMessage(labels.item_plural, { total })}`}
        {hasFilter && (
          <>
            {" "}
            &mdash; Active {filterBadges.length === 1
              ? "Filter"
              : "Filters"}: {filterBadges}
          </>
        )}
        {!showSelectionCount && !hasFilter && (
          <>
            {" "}
            &mdash;{" "}
            <FormattedMessage
              id="project.explorer.action-bar.currently_selected.info"
              defaultMessage={
                "Select files via checkbox or drag and drop to move them."
              }
            />
          </>
        )}
        {refreshButton && <> &middot; {refreshButton}</>}
        <ClipboardPill
          project_id={props.project_id ?? ""}
          current_path={props.explorer_browsing_path ?? props.current_path ?? ""}
        />
      </span>
      {switchButton}
      {helpButton}
    </div>
  );
};

// Ordered by frequency of use — most common first, share last (often the
// final step).  "download" is listed first because it is skipped in
// context-menus for non-directories and handled separately there.
const ACTION_BUTTONS_SINGLE = [
  "download",
  "rename",
  "copy",
  "move",
  "delete",
  "duplicate",
  "compress",
  "share",
] as const;

export const ACTION_BUTTONS_FILE = ACTION_BUTTONS_SINGLE;
export const ACTION_BUTTONS_DIR = ACTION_BUTTONS_SINGLE;

// Multi-selection: omit single-file-only actions (rename, duplicate, share)
const SINGLE_ONLY = ["rename", "duplicate", "share"] as const;
export const ACTION_BUTTONS_MULTI = ACTION_BUTTONS_SINGLE.filter(
  (a) => !(SINGLE_ONLY as readonly string[]).includes(a),
);

export function isDisabledSnapshots(name: string) {
  return [
    "move",
    "compress",
    "rename",
    "delete",
    "share",
    "duplicate",
  ].includes(name);
}

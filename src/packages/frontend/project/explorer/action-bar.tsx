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
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { CustomSoftwareInfo } from "@cocalc/frontend/custom-software/info-bar";
import { ComputeImages } from "@cocalc/frontend/custom-software/init";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import ExplorerHelp from "@cocalc/frontend/project/explorer/explorer-help";
import type { FileAction } from "@cocalc/frontend/project_actions";
import { FILE_ACTIONS, ProjectActions } from "@cocalc/frontend/project_actions";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const ROW_INFO_STYLE = {
  color: COLORS.TAB,
  height: "22px",
  margin: "5px 3px",
} as const;

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

  if (disableActions) {
    return <div></div>;
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
    if (props.listing.length === 0) {
      return;
    }

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
      <Button data-cocalc-test="check-all" onClick={check_all_click_handler}>
        <Icon name={button_icon} /> {button_text}
      </Button>
    );
  }

  function render_directory_tree_toggle(): React.JSX.Element | undefined {
    if (!props.on_toggle_directory_tree) {
      return;
    }
    return (
      <BootstrapButton
        onClick={props.on_toggle_directory_tree}
        active={!!props.show_directory_tree}
        title="Show or hide directory tree"
      >
        <Icon name="network" style={{ transform: "rotate(270deg)" }} />
      </BootstrapButton>
    );
  }

  function render_currently_selected(): React.JSX.Element | undefined {
    if (props.listing.length === 0) {
      return;
    }
    const checked = props.checked_files.size;
    const total = props.listing.length;

    const helpButton = props.project_id ? (
      <ExplorerHelp project_id={props.project_id} />
    ) : null;

    if (checked === 0) {
      return (
        <div
          style={{
            ...ROW_INFO_STYLE,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ flex: 1 }}>
            {total} {intl.formatMessage(labels.item_plural, { total })} &mdash;{" "}
            <FormattedMessage
              id="project.explorer.action-bar.currently_selected.info"
              defaultMessage={
                "Click the checkbox to the left of a file to copy, download, etc."
              }
            />
          </span>
          {helpButton}
        </div>
      );
    } else {
      return (
        <div
          style={{
            ...ROW_INFO_STYLE,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ flex: 1 }}>
            {intl.formatMessage(
              {
                id: "project.explorer.action-bar.currently_selected.items",
                defaultMessage: "{checked} of {total} {items} selected",
              },
              {
                checked,
                total,
                items: intl.formatMessage(labels.item_plural, { total }),
              },
            )}
          </span>
          {helpButton}
        </div>
      );
    }
  }

  function render_action_button(name: FileAction): React.JSX.Element {
    const disabled =
      isDisabledSnapshots(name) &&
      (props.current_path != null
        ? props.current_path.startsWith(".snapshots")
        : undefined);
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
    <div style={{ flex: "1 0 auto" }}>
      <div style={{ flex: "1 0 auto" }}>
        <Space wrap style={{ whiteSpace: "nowrap", padding: "0" }}>
          {props.project_is_running
            ? render_directory_tree_toggle()
            : undefined}
          {props.project_is_running ? render_check_all_button() : undefined}
          {render_button_area()}
        </Space>
      </div>
      <div style={{ flex: "1 0 auto" }}>
        {props.project_is_running ? render_currently_selected() : undefined}
      </div>
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

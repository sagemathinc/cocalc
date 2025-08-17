/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";
import * as immutable from "immutable";
import React, { useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, ButtonToolbar } from "@cocalc/frontend/antd-bootstrap";
import { Gap, Icon } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { CustomSoftwareInfo } from "@cocalc/frontend/custom-software/info-bar";
import { type ComputeImages } from "@cocalc/frontend/custom-software/init";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import {
  file_actions,
  type ProjectActions,
  type FileAction,
} from "@cocalc/frontend/project_store";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { DirectoryListingEntry } from "@cocalc/util/types";
import { VisibleMDLG } from "@cocalc/frontend/components";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";

const ROW_INFO_STYLE = {
  color: COLORS.GRAY,
  height: "22px",
  margin: "5px 3px",
} as const;

interface Props {
  project_id?: string;
  checked_files: immutable.Set<string>;
  listing: DirectoryListingEntry[];
  current_path?: string;
  project_map?;
  images?: ComputeImages;
  actions: ProjectActions;
  available_features?;
  show_custom_software_reset?: boolean;
  project_is_running?: boolean;
}

export function ActionBar({
  project_id,
  checked_files,
  listing,
  current_path,
  project_map,
  images,
  actions,
  available_features,
  show_custom_software_reset,
  project_is_running,
}: Props) {
  const intl = useIntl();
  const buttonRef = useRef<HTMLDivElement>(null);
  const student_project_functionality = useStudentProjectFunctionality(
    actions.project_id,
  );
  if (student_project_functionality.disableActions) {
    return <div></div>;
  }

  function clear_selection(): void {
    actions.set_all_files_unchecked();
  }

  function check_all_click_handler(): void {
    if (checked_files.size === 0) {
      actions.set_file_list_checked(
        listing.map((file) => misc.path_to_file(current_path ?? "", file.name)),
      );
    } else {
      clear_selection();
    }
  }

  function render_check_all_button(): React.JSX.Element | undefined {
    if (listing.length === 0) {
      return;
    }

    const checked = checked_files.size > 0;
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
    if (checked_files.size === 0) {
      button_icon = "square-o";
    } else {
      if (checked_files.size >= listing.length) {
        button_icon = "check-square-o";
      } else {
        button_icon = "minus-square-o";
      }
    }

    return (
      <Button
        bsSize="small"
        cocalc-test="check-all"
        onClick={check_all_click_handler}
      >
        <Icon name={button_icon} /> {button_text}
      </Button>
    );
  }

  function render_currently_selected(): React.JSX.Element | undefined {
    if (listing.length === 0) {
      return;
    }
    const checked = checked_files.size;
    const total = listing.length;
    const style = ROW_INFO_STYLE;

    if (checked === 0) {
      return (
        <div style={style}>
          <span>
            {total} {intl.formatMessage(labels.item_plural, { total })}
          </span>
          <div style={{ display: "inline" }}>
            {" "}
            &mdash;{" "}
            <FormattedMessage
              id="project.explorer.action-bar.currently_selected.info"
              defaultMessage={
                "Click the checkbox to the left of a file to copy, download, etc."
              }
            />
          </div>
        </div>
      );
    } else {
      return (
        <div style={style}>
          <span>
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
          <Gap />
        </div>
      );
    }
  }

  function render_action_button(name: FileAction): React.JSX.Element {
    const disabled =
      isDisabledSnapshots(name) &&
      (current_path != null
        ? current_path.startsWith(SNAPSHOTS)
        : undefined);
    const obj = file_actions[name];
    const handle_click = (_e: React.MouseEvent) => {
      actions.set_file_action(name);
    };

    return (
      <Button onClick={handle_click} disabled={disabled} key={name}>
        <Icon name={obj.icon} />{" "}
        <VisibleMDLG>{`${intl.formatMessage(obj.name)}...`}</VisibleMDLG>
      </Button>
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
    if (checked_files.size === 0) {
      return;
    } else if (checked_files.size === 1) {
      let isDir;
      const item = checked_files.first();
      for (const file of listing) {
        if (misc.path_to_file(current_path ?? "", file.name) === item) {
          ({ isDir } = file);
        }
      }

      if (isDir) {
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
    if (checked_files.size === 0) {
      if (
        project_id == null ||
        images == null ||
        project_map == null ||
        available_features == null
      ) {
        return;
      }
      return (
        <Space.Compact>
          <CustomSoftwareInfo
            project_id={project_id}
            images={images}
            project_map={project_map}
            actions={actions}
            available_features={available_features}
            show_custom_software_reset={!!show_custom_software_reset}
            project_is_running={!!project_is_running}
          />
        </Space.Compact>
      );
    } else {
      return render_action_buttons();
    }
  }
  if (checked_files.size === 0 && IS_MOBILE) {
    return null;
  }
  return (
    <div style={{ flex: "1 0 auto" }}>
      <div ref={buttonRef} style={{ flex: "1 0 auto" }}>
        <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
          <Space.Compact>{render_check_all_button()}</Space.Compact>
          {render_button_area()}
        </ButtonToolbar>
      </div>
      <div style={{ flex: "1 0 auto" }}>{render_currently_selected()}</div>
    </div>
  );
}

export const ACTION_BUTTONS_DIR = [
  "download",
  "compress",
  "delete",
  "rename",
  "duplicate",
  "move",
  "copy",
  "share",
] as const;

export const ACTION_BUTTONS_FILE = [
  "download",
  "compress",
  "delete",
  "rename",
  "duplicate",
  "move",
  "copy",
  "share",
] as const;

export const ACTION_BUTTONS_MULTI = [
  "download",
  "compress",
  "delete",
  "move",
  "copy",
] as const;

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

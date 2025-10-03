/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space, Tooltip } from "antd";
import * as immutable from "immutable";
import React, { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, ButtonToolbar } from "@cocalc/frontend/antd-bootstrap";
import { Gap, Icon } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { CustomSoftwareInfo } from "@cocalc/frontend/custom-software/info-bar";
import { ComputeImages } from "@cocalc/frontend/custom-software/init";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import { file_actions, ProjectActions } from "@cocalc/frontend/project_store";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const ROW_INFO_STYLE = {
  color: COLORS.GRAY,
  height: "22px",
  margin: "5px 3px",
} as const;

interface Props {
  project_id?: string;
  checked_files: immutable.Set<string>;
  listing: { name: string; isdir: boolean }[];
  page_number: number;
  page_size: number;
  current_path?: string;
  project_map?: immutable.Map<string, string>;
  images?: ComputeImages;
  actions: ProjectActions;
  available_features?;
  show_custom_software_reset?: boolean;
  project_is_running?: boolean;
}

export const ActionBar: React.FC<Props> = (props: Props) => {
  const intl = useIntl();
  const [select_entire_directory, set_select_entire_directory] = useState<
    "hidden" | "check" | "clear"
  >("hidden");
  const student_project_functionality = useStudentProjectFunctionality(
    props.actions.project_id,
  );
  if (student_project_functionality.disableActions) {
    return <div></div>;
  }

  useEffect(() => {
    // user changed directory, hide the "select entire directory" button
    if (select_entire_directory !== "hidden") {
      set_select_entire_directory("hidden");
    }
  }, [props.current_path]);

  useEffect(() => {
    if (
      props.checked_files.size === props.listing.length &&
      select_entire_directory === "check"
    ) {
      // user just clicked the "select entire directory" button, show the "clear" button
      set_select_entire_directory("clear");
    }
  }, [props.checked_files, props.listing, select_entire_directory]);

  function clear_selection(): void {
    props.actions.set_all_files_unchecked();
    if (select_entire_directory !== "hidden") {
      set_select_entire_directory("hidden");
    }
  }

  function check_all_click_handler(): void {
    if (props.checked_files.size === 0) {
      const files_on_page = props.listing.slice(
        props.page_size * props.page_number,
        props.page_size * (props.page_number + 1),
      );
      props.actions.set_file_list_checked(
        files_on_page.map((file) =>
          misc.path_to_file(props.current_path ?? "", file.name),
        ),
      );
      if (props.listing.length > props.page_size) {
        // if there are more items than one page, show a button to select everything
        set_select_entire_directory("check");
      }
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
      <Button
        bsSize="small"
        cocalc-test="check-all"
        onClick={check_all_click_handler}
      >
        <Icon name={button_icon} /> {button_text}
      </Button>
    );
  }

  function do_select_entire_directory(): void {
    props.actions.set_file_list_checked(
      props.listing.map((file) =>
        misc.path_to_file(props.current_path ?? "", file.name),
      ),
    );
  }

  function render_select_entire_directory(): React.JSX.Element | undefined {
    switch (select_entire_directory) {
      case "check":
        return (
          <Button bsSize="xsmall" onClick={do_select_entire_directory}>
            Select All {props.listing.length} Items
          </Button>
        );
      case "clear":
        return (
          <Button bsSize="xsmall" onClick={clear_selection}>
            Clear Entire Selection
          </Button>
        );
    }
  }

  function render_currently_selected(): React.JSX.Element | undefined {
    if (props.listing.length === 0) {
      return;
    }
    const checked = props.checked_files.size;
    const total = props.listing.length;
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
          {render_select_entire_directory()}
        </div>
      );
    }
  }

  function render_action_button(name: string): React.JSX.Element {
    const disabled =
      isDisabledSnapshots(name) &&
      (props.current_path != null
        ? props.current_path.startsWith(".snapshots")
        : undefined);
    const obj = file_actions[name];
    const handle_click = (_e: React.MouseEvent) => {
      props.actions.set_file_action(name);
    };

    return (
      <Tooltip title={intl.formatMessage(obj.name)}>
        <Button onClick={handle_click} disabled={disabled} key={name}>
          <Icon name={obj.icon} />
        </Button>
        &nbsp;
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
        <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
          <Space.Compact>
            {props.project_is_running ? render_check_all_button() : undefined}
          </Space.Compact>
          {render_button_area()}
        </ButtonToolbar>
      </div>
      <div style={{ flex: "1 0 auto" }}>
        {props.project_is_running ? render_currently_selected() : undefined}
      </div>
    </div>
  );
};

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

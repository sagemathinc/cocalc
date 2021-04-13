/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import * as immutable from "immutable";
import { HiddenSM, Icon, Space } from "../../r_misc";
import { COLORS } from "smc-util/theme";
import { ComputeImages } from "smc-webapp/custom-software/init";
import { ProjectActions } from "smc-webapp/project_store";

import { Button, ButtonGroup, ButtonToolbar } from "smc-webapp/antd-bootstrap";

import { CustomSoftwareInfo } from "smc-webapp/custom-software/info-bar";
import * as misc from "smc-util/misc";
import { file_actions } from "smc-webapp/project_store";

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
  public_view: boolean;
  current_path?: string;
  project_map?: immutable.Map<string, string>;
  images?: ComputeImages;
  actions: ProjectActions;
  available_features?;
  show_custom_software_reset?: boolean;
  project_is_running?: boolean;
}

import { useStudentProjectFunctionality } from "smc-webapp/course";

export const ActionBar: React.FC<Props> = (props) => {
  const [select_entire_directory, set_select_entire_directory] = React.useState<
    "hidden" | "check" | "clear"
  >("hidden");
  const student_project_functionality = useStudentProjectFunctionality(
    props.actions.project_id
  );
  if (student_project_functionality.disableActions) {
    return <div></div>;
  }

  /*
  componentDidUpdate(prevProps: Props): void {
    if (prevProps.current_path !== props.current_path) {
      // user changed directory, hide the "select entire directory" button
      if (select_entire_directory !== "hidden") {
        set_select_entire_directory("hidden");
      }
    } else if (
      props.checked_files.size === props.listing.length &&
      select_entire_directory === "check"
    ) {
      // user just clicked the "select entire directory" button, show the "clear" button
      set_select_entire_directory("clear");
    }
  }
  */

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
        props.page_size * (props.page_number + 1)
      );
      props.actions.set_file_list_checked(
        files_on_page.map((file) =>
          misc.path_to_file(props.current_path ?? "", file.name)
        )
      );
      if (props.listing.length > props.page_size) {
        // if there are more items than one page, show a button to select everything
        set_select_entire_directory("check");
      }
    } else {
      clear_selection();
    }
  }

  function render_check_all_button(): JSX.Element | undefined {
    let button_icon, button_text;
    if (props.listing.length === 0) {
      return;
    }
    if (props.checked_files.size === 0) {
      button_icon = "square-o";
      button_text = "Check All";
    } else {
      button_text = "Uncheck All";

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
        misc.path_to_file(props.current_path ?? "", file.name)
      )
    );
  }

  function render_select_entire_directory(): JSX.Element | undefined {
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

  function render_currently_selected(): JSX.Element | undefined {
    if (props.listing.length === 0) {
      return;
    }
    const checked = props.checked_files.size;
    const total = props.listing.length;
    const style = ROW_INFO_STYLE;

    if (checked === 0) {
      return (
        <div style={style}>
          <span>{`${total} ${misc.plural(total, "item")}`}</span>
          <div style={{ display: "inline" }}>
            {" "}
            &mdash; Click checkbox to the left of a file to copy, download, etc.
          </div>
        </div>
      );
    } else {
      return (
        <div style={style}>
          <span>{`${checked} of ${total} ${misc.plural(
            total,
            "item"
          )} selected`}</span>
          <Space />
          {render_select_entire_directory()}
        </div>
      );
    }
  }

  function render_action_button(name: string): JSX.Element {
    const disabled =
      ["move", "compress", "rename", "delete", "share", "duplicate"].includes(
        name
      ) &&
      (props.current_path != null
        ? props.current_path.startsWith(".snapshots")
        : undefined);
    const obj = file_actions[name];
    const get_basename = () => {
      return misc.path_split(props.checked_files.first()).tail;
    };
    const handle_click = (_e: React.MouseEvent) => {
      props.actions.set_file_action(name, get_basename);
    };

    return (
      <Button onClick={handle_click} disabled={disabled} key={name}>
        <Icon name={obj.icon} /> <HiddenSM>{obj.name}...</HiddenSM>
      </Button>
    );
  }

  function render_action_buttons(): JSX.Element | undefined {
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
        action_buttons = [
          "download",
          "compress",
          "delete",
          "rename",
          "duplicate",
          "move",
          "copy",
          "share",
        ];
      } else {
        // one file selected
        action_buttons = [
          "download",
          "delete",
          "rename",
          "duplicate",
          "move",
          "copy",
          "share",
        ];
      }
    } else {
      // multiple items selected
      action_buttons = ["download", "compress", "delete", "move", "copy"];
    }
    if (props.public_view) {
      action_buttons = ["copy", "download"];
    }
    return (
      <ButtonGroup>
        {action_buttons.map((v) => render_action_button(v))}
      </ButtonGroup>
    );
  }

  function render_button_area(): JSX.Element | undefined {
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
        <CustomSoftwareInfo
          project_id={props.project_id}
          images={props.images}
          project_map={props.project_map}
          actions={props.actions}
          available_features={props.available_features}
          show_custom_software_reset={!!props.show_custom_software_reset}
          project_is_running={!!props.project_is_running}
        />
      );
    } else {
      return render_action_buttons();
    }
  }

  return (
    <div style={{ flex: "1 0 auto" }}>
      <div style={{ flex: "1 0 auto" }}>
        <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
          <ButtonGroup>
            {props.project_is_running ? render_check_all_button() : undefined}
          </ButtonGroup>
          {render_button_area()}
        </ButtonToolbar>
      </div>
      <div style={{ flex: "1 0 auto" }}>
        {props.project_is_running ? render_currently_selected() : undefined}
      </div>
    </div>
  );
};

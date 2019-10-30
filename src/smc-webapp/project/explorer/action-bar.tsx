import * as React from "react";
import * as immutable from "immutable";
import { COLORS, HiddenSM, Icon, Space } from "../../r_misc";
import { analytics_event } from "../../tracker";
import { ComputeImages } from "smc-webapp/custom-software/init";
import { ProjectActions } from "smc-webapp/project_store";

const { Button, ButtonGroup, ButtonToolbar } = require("react-bootstrap");
const { CustomSoftwareInfo } = require("../../custom-software/info-bar");
const misc = require("smc-util/misc");
const { file_actions } = require("../../project_store");

const ROW_INFO_STYLE = {
  color: COLORS.GRAY,
  height: "22px",
  margin: "5px 3px"
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
  available_features?: object;
  show_custom_software_reset?: boolean;
  project_is_running?: boolean;
}

interface State {
  select_entire_directory: "hidden" | "check" | "clear"; // hidden -> check -> clear
}

export class ActionBar extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { select_entire_directory: "hidden" };
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.current_path !== this.props.current_path) {
      // user changed directory, hide the "select entire directory" button
      if (this.state.select_entire_directory !== "hidden") {
        return this.setState({ select_entire_directory: "hidden" });
      }
    } else if (
      this.props.checked_files.size === this.props.listing.length &&
      this.state.select_entire_directory === "check"
    ) {
      // user just clicked the "select entire directory" button, show the "clear" button
      this.setState({ select_entire_directory: "clear" });
    }
  }

  clear_selection = (): void => {
    this.props.actions.set_all_files_unchecked();
    if (this.state.select_entire_directory !== "hidden") {
      this.setState({ select_entire_directory: "hidden" });
    }
  };

  check_all_click_handler = (): void => {
    if (this.props.checked_files.size === 0) {
      const files_on_page = this.props.listing.slice(
        this.props.page_size * this.props.page_number,
        this.props.page_size * (this.props.page_number + 1)
      );
      this.props.actions.set_file_list_checked(
        files_on_page.map(file =>
          misc.path_to_file(this.props.current_path, file.name)
        )
      );
      if (this.props.listing.length > this.props.page_size) {
        // if there are more items than one page, show a button to select everything
        this.setState({ select_entire_directory: "check" });
      }
    } else {
      this.clear_selection();
    }
  };

  render_check_all_button(): JSX.Element | undefined {
    let button_icon, button_text;
    if (this.props.listing.length === 0) {
      return;
    }
    if (this.props.checked_files.size === 0) {
      button_icon = "square-o";
      button_text = "Check All";
    } else {
      button_text = "Uncheck All";

      if (this.props.checked_files.size >= this.props.listing.length) {
        button_icon = "check-square-o";
      } else {
        button_icon = "minus-square-o";
      }
    }

    return (
      <Button
        bsSize="small"
        cocalc-test="check-all"
        onClick={this.check_all_click_handler}
      >
        <Icon name={button_icon} /> {button_text}
      </Button>
    );
  }

  select_entire_directory = (): void => {
    this.props.actions.set_file_list_checked(
      this.props.listing.map(file =>
        misc.path_to_file(this.props.current_path, file.name)
      )
    );
  };

  render_select_entire_directory(): JSX.Element | undefined {
    switch (this.state.select_entire_directory) {
      case "check":
        return (
          <Button bsSize="xsmall" onClick={this.select_entire_directory}>
            Select All {this.props.listing.length} Items
          </Button>
        );
      case "clear":
        return (
          <Button bsSize="xsmall" onClick={this.clear_selection}>
            Clear Entire Selection
          </Button>
        );
    }
  }

  render_currently_selected(): JSX.Element | undefined {
    if (this.props.listing.length === 0) {
      return;
    }
    const checked = this.props.checked_files.size;
    const total = this.props.listing.length;
    const style = ROW_INFO_STYLE;

    if (checked === 0) {
      return (
        <div style={style}>
          <span>{`${total} ${misc.plural(total, "item")}`}</span>
          <div style={{ display: "inline" }}>
            {" "}
            &mdash; Click on the checkbox to the left of a file to copy, move,
            delete, download, etc.
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
          {this.render_select_entire_directory()}
        </div>
      );
    }
  }

  render_action_button(name: string): JSX.Element {
    const disabled =
      ["move", "compress", "rename", "delete", "share", "duplicate"].includes(
        name
      ) &&
      (this.props.current_path != null
        ? this.props.current_path.startsWith(".snapshots")
        : undefined);
    const obj = file_actions[name];
    const get_basename = () => {
      return misc.path_split(this.props.checked_files.first()).tail;
    };
    const handle_click = (_e: React.MouseEvent) => {
      this.props.actions.set_file_action(name, get_basename);
      analytics_event("project_file_listing", "open " + name + " menu");
    };

    return (
      <Button onClick={handle_click} disabled={disabled} key={name}>
        <Icon name={obj.icon} /> <HiddenSM>{obj.name}...</HiddenSM>
      </Button>
    );
  }

  render_action_buttons(): JSX.Element | undefined {
    let action_buttons: (
      | "download"
      | "compress"
      | "delete"
      | "rename"
      | "duplicate"
      | "move"
      | "copy"
      | "share")[];
    if (!this.props.project_is_running) {
      return;
    }
    if (this.props.checked_files.size === 0) {
      return;
    } else if (this.props.checked_files.size === 1) {
      let isdir;
      const item = this.props.checked_files.first();
      for (let file of this.props.listing) {
        if (misc.path_to_file(this.props.current_path, file.name) === item) {
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
          "share"
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
          "share"
        ];
      }
    } else {
      // multiple items selected
      action_buttons = ["download", "compress", "delete", "move", "copy"];
    }
    if (this.props.public_view) {
      action_buttons = ["copy", "download"];
    }
    return (
      <ButtonGroup bsSize="small">
        {action_buttons.map(v => this.render_action_button(v))}
      </ButtonGroup>
    );
  }

  render_button_area(): JSX.Element | undefined {
    if (this.props.checked_files.size === 0) {
      return (
        <CustomSoftwareInfo
          project_id={this.props.project_id}
          images={this.props.images}
          project_map={this.props.project_map}
          actions={this.props.actions}
          available_features={this.props.available_features}
          show_custom_software_reset={this.props.show_custom_software_reset}
          project_is_running={this.props.project_is_running}
        />
      );
    } else {
      return this.render_action_buttons();
    }
  }

  render(): JSX.Element {
    return (
      <div style={{ flex: "1 0 auto" }}>
        <div style={{ flex: "1 0 auto" }}>
          <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
            <ButtonGroup>
              {this.props.project_is_running
                ? this.render_check_all_button()
                : undefined}
            </ButtonGroup>
            {this.render_button_area()}
          </ButtonToolbar>
        </div>
        <div style={{ flex: "1 0 auto" }}>
          {this.props.project_is_running
            ? this.render_currently_selected()
            : undefined}
        </div>
      </div>
    );
  }
}

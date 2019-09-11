/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as React from "react";
import { Configuration } from "./Explorer";
import { EXTs as ALL_FILE_BUTTON_TYPES } from "../file-listing/utils";
import { Icon } from "../../r_misc";
import { analytics_event } from "../../tracker";

const { MenuItem, SplitButton } = require("react-bootstrap");

interface Props {
  file_search: string;
  current_path: string;
  actions: any;
  create_folder: (switch_over?: boolean) => void;
  create_file: (ext?: string, switch_over?: boolean) => void;
  configuration?: Configuration;
  disabled: boolean;
}

export class ProjectFilesNew extends React.Component<Props> {
  static defaultProps = {
    file_search: ""
  };

  new_file_button_types() {
    if (this.props.configuration != null) {
      const { disabled_ext } = this.props.configuration.get("main", {
        disabled_ext: undefined
      });
      if (disabled_ext != null) {
        return ALL_FILE_BUTTON_TYPES.filter(ext => !disabled_ext.includes(ext));
      }
    }
    return ALL_FILE_BUTTON_TYPES;
  }

  // Rendering doesnt rely on props...
  shouldComponentUpdate() {
    return false;
  }

  file_dropdown_icon() {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <Icon name="plus-circle" /> New
      </span>
    );
  }

  file_dropdown_item(i, ext) {
    const { file_options } = require("./editor");
    const data = file_options("x." + ext);
    return (
      <MenuItem
        eventKey={i}
        key={i}
        onClick={() => this.on_menu_item_clicked(ext)}
      >
        <Icon name={data.icon} />{" "}
        <span style={{ textTransform: "capitalize" }}>{data.name} </span>{" "}
        <span style={{ color: "#666" }}>(.{ext})</span>
      </MenuItem>
    );
  }

  on_menu_item_clicked(ext) {
    if (this.props.file_search.length === 0) {
      // Tell state to render an error in file search
      return this.props.actions.ask_filename(ext);
    } else {
      return this.props.create_file(ext);
    }
  }

  // Go to new file tab if no file is specified
  on_create_button_clicked() {
    if (this.props.file_search.length === 0) {
      this.props.actions.toggle_new();
      analytics_event("project_file_listing", "search_create_button", "empty");
    } else if (
      this.props.file_search[this.props.file_search.length - 1] === "/"
    ) {
      this.props.create_folder();
      return analytics_event(
        "project_file_listing",
        "search_create_button",
        "folder"
      );
    } else {
      this.props.create_file();
      analytics_event("project_file_listing", "search_create_button", "file");
    }
  }

  render() {
    // console.log("ProjectFilesNew configuration", @props.configuration?.toJS())
    return (
      <SplitButton
        id={"new_file_dropdown"}
        title={this.file_dropdown_icon()}
        onClick={this.on_create_button_clicked}
        disabled={this.props.disabled}
      >
        {(() => {
          const result: JSX.Element[] = [];
          const object = this.new_file_button_types();
          for (let i in object) {
            const ext = object[i];
            result.push(this.file_dropdown_item(i, ext));
          }
          return result;
        })()}
        <MenuItem divider />
        <MenuItem
          eventKey="folder"
          key="folder"
          onSelect={this.props.create_folder}
        >
          <Icon name="folder" /> Folder
        </MenuItem>
      </SplitButton>
    );
  }
}

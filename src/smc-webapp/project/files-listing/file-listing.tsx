/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as React from "react";
import * as immutable from "immutable";

const misc = require("smc-util/misc");
const { Col } = require("react-bootstrap");
const { VisibleMDLG } = require("../../r_misc");

import { ProjectActions } from "../../project_actions";
import { AppRedux } from "../../app-framework";

import { NoFiles } from "./no-files";
import { FirstSteps } from "./first-steps";
import { TerminalModeDisplay } from "./terminal-mode-display";
import { ListingHeader } from "./listing-header";
import { DirectoryRow } from "./directory-row";
import { FileRow } from "./file-row";
import { TERM_MODE_CHAR } from "./utils";

interface Props {
  // TODO: everything but actions/redux should be immutable JS data, and use shouldComponentUpdate
  actions: ProjectActions;
  redux: AppRedux;

  active_file_sort?: any;
  listing: any[];
  file_map: object;
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  page_number: number;
  page_size: number;
  public_view: boolean;
  create_folder: () => void; // TODO: should be action!
  create_file: () => void; // TODO: should be action!
  selected_file_index: number;
  project_id: string;
  shift_is_down: boolean;
  sort_by: (heading: string) => void; // TODO: should be data
  library: object;
  other_settings: immutable.Map<any, any>;
  show_new: boolean;
}

export class FileListing extends React.Component<Props> {
  static defaultProps = { file_search: "" };

  render_row(
    name,
    size,
    time,
    mask,
    isdir,
    display_name,
    public_data,
    issymlink,
    index
  ) {
    let color;
    const checked = this.props.checked_files.has(
      misc.path_to_file(this.props.current_path, name)
    );
    const { is_public } = this.props.file_map[name];
    if (checked) {
      if (index % 2 === 0) {
        color = "#a3d4ff";
      } else {
        color = "#a3d4f0";
      }
    } else if (index % 2 === 0) {
      color = "#eee";
    } else {
      color = "white";
    }
    const apply_border =
      index === this.props.selected_file_index &&
      this.props.file_search[0] !== TERM_MODE_CHAR;
    if (isdir) {
      return (
        <DirectoryRow
          name={name}
          display_name={display_name}
          time={time}
          size={size}
          issymlink={issymlink}
          key={index}
          color={color}
          bordered={apply_border}
          mask={mask}
          public_data={public_data}
          is_public={is_public}
          checked={checked}
          current_path={this.props.current_path}
          actions={this.props.actions}
          no_select={this.props.shift_is_down}
          public_view={this.props.public_view}
        />
      );
    } else {
      return (
        <FileRow
          name={name}
          display_name={display_name}
          time={time}
          size={size}
          issymlink={issymlink}
          color={color}
          bordered={apply_border}
          mask={mask}
          public_data={public_data}
          is_public={is_public}
          checked={checked}
          key={index}
          current_path={this.props.current_path}
          actions={this.props.actions}
          no_select={this.props.shift_is_down}
          public_view={this.props.public_view}
        />
      );
    }
  }

  render_rows() {
    return Array.from(this.props.listing).map((a, i) =>
      this.render_row(
        a.name,
        a.size,
        a.mtime,
        a.mask,
        a.isdir,
        a.display_name,
        a.public,
        a.issymlink,
        i
      )
    );
  }

  render_no_files() {
    if (this.props.show_new) {
      return;
    }
    if (this.props.listing.length !== 0) {
      return;
    }
    if (this.props.file_search[0] === TERM_MODE_CHAR) {
      return;
    }
    return (
      <NoFiles
        current_path={this.props.current_path}
        actions={this.props.actions}
        public_view={this.props.public_view}
        file_search={this.props.file_search}
        create_folder={this.props.create_folder}
        create_file={this.props.create_file}
      />
    );
  }

  render_first_steps() {
    let left;
    return; // See https://github.com/sagemathinc/cocalc/issues/3138
    const name = "first_steps";
    if (this.props.public_view) {
      return;
    }
    if (!this.props.library[name]) {
      return;
    }
    if (
      !((left =
        this.props.other_settings != null
          ? this.props.other_settings.get(name)
          : undefined) != null
        ? left
        : false)
    ) {
      return;
    }
    if (this.props.current_path !== "") {
      return;
    } // only show in $HOME
    if (
      this.props.file_map[name] != null
        ? this.props.file_map[name].isdir
        : undefined
    ) {
      return;
    } // don't show if we have it ...
    if (this.props.file_search[0] === TERM_MODE_CHAR) {
      return;
    }

    return <FirstSteps actions={this.props.actions} redux={this.props.redux} />;
  }

  render_terminal_mode() {
    if (this.props.file_search[0] === TERM_MODE_CHAR) {
      return <TerminalModeDisplay />;
    }
  }

  render() {
    return (
      <>
        <Col sm={12} style={{ zIndex: 1 }}>
          {!this.props.public_view ? this.render_terminal_mode() : undefined}
          {this.props.listing.length > 0 ? (
            <ListingHeader
              active_file_sort={this.props.active_file_sort}
              sort_by={this.props.sort_by}
            />
          ) : (
            undefined
          )}
          {this.render_rows()}
          {this.render_no_files()}
        </Col>
        <VisibleMDLG>{this.render_first_steps()}</VisibleMDLG>
      </>
    );
  }
}

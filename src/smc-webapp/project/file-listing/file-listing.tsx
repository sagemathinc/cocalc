/*
Show a file listing.

NOTES:

 - TODO: If we want to preserve the scroll position let's just not unmount this component (like we do with editors).
*/

import * as React from "react";
import * as immutable from "immutable";
import { WindowedList } from "../../r_misc/windowed-list2";

const misc = require("smc-util/misc");
const { Col, Row } = require("react-bootstrap");
const { VisibleMDLG } = require("../../r_misc");

import { ProjectActions } from "../../project_actions";
import { AppRedux, Rendered } from "../../app-framework";

import { NoFiles } from "./no-files";
// import { FirstSteps } from "./first-steps";
import { TerminalModeDisplay } from "./terminal-mode-display";
import { ListingHeader } from "./listing-header";
import { DirectoryRow } from "./directory-row";
import { FileRow } from "./file-row";
import { TERM_MODE_CHAR } from "./utils";
import { MainConfiguration } from "../../project_configuration";

interface Props {
  // TODO: everything but actions/redux should be immutable JS data, and use shouldComponentUpdate
  actions: ProjectActions;
  redux: AppRedux;

  name: string;
  active_file_sort?: any;
  listing: any[];
  file_map: object;
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  public_view: boolean;
  create_folder: () => void; // TODO: should be action!
  create_file: () => void; // TODO: should be action!
  selected_file_index: number;
  project_id: string;
  shift_is_down: boolean;
  sort_by: (heading: string) => void; // TODO: should be data
  library: object;
  other_settings?: immutable.Map<any, any>;
  show_new: boolean;
  last_scroll_top?: number;
  configuration_main?: MainConfiguration;
}

export class FileListing extends React.Component<Props> {
  static defaultProps = { file_search: "" };
  private list_ref = React.createRef<WindowedList>();

  constructor(props) {
    super(props);
  }

  private render_row(
    name,
    size,
    time,
    mask,
    isdir,
    display_name,
    public_data,
    issymlink,
    index: number
  ): Rendered {
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

  private windowed_list_render_row({ index }): Rendered {
    const a = this.props.listing[index];
    if (a == null) return;
    return this.render_row(
      a.name,
      a.size,
      a.mtime,
      a.mask,
      a.isdir,
      a.display_name,
      a.public,
      a.issymlink,
      index
    );
  }

  private windowed_list_row_key(index: number): string | undefined {
    const a = this.props.listing[index];
    if (a == null) return;
    return a.name;
  }

  private render_rows(): Rendered {
    return (
      <WindowedList
        ref={this.list_ref}
        overscan_row_count={20}
        estimated_row_size={30}
        row_count={this.props.listing.length}
        row_renderer={this.windowed_list_render_row.bind(this)}
        row_key={this.windowed_list_row_key.bind(this)}
        scroll_to_index={this.props.selected_file_index}
        cache_id={this.props.name + this.props.current_path}
      />
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
        name={this.props.name}
        current_path={this.props.current_path}
        actions={this.props.actions}
        public_view={this.props.public_view}
        file_search={this.props.file_search}
        create_folder={this.props.create_folder}
        create_file={this.props.create_file}
        project_id={this.props.project_id}
        configuration_main={this.props.configuration_main}
      />
    );
  }

  private render_first_steps(): Rendered {
    return; // See https://github.com/sagemathinc/cocalc/issues/3138
    /*
    const name = "first_steps";
    if (this.props.public_view) {
      return;
    }
    if (!this.props.library[name]) {
      return;
    }
    let setting: string | undefined;
    if (this.props.other_settings !== undefined) {
      setting = (this.props.other_settings as any).get(name)
    }
    if (!setting) {
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
    */
  }

  private render_terminal_mode(): Rendered {
    if (this.props.file_search[0] === TERM_MODE_CHAR) {
      return <TerminalModeDisplay />;
    }
  }

  public render(): Rendered {
    return (
      <>
        <Col
          sm={12}
          style={{
            flex: "1 0 auto",
            zIndex: 1,
            display: "flex",
            flexDirection: "column"
          }}
        >
          {!this.props.public_view && this.render_terminal_mode()}
          {this.props.listing.length > 0 && (
            <ListingHeader
              active_file_sort={this.props.active_file_sort}
              sort_by={this.props.sort_by}
            />
          )}
          {this.props.listing.length > 0 && (
            <Row className="smc-vfill">{this.render_rows()}</Row>
          )}
          {this.render_no_files()}
        </Col>
        <VisibleMDLG>{this.render_first_steps()}</VisibleMDLG>
      </>
    );
  }
}

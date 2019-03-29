import * as React from "react";
import * as immutable from "immutable";
import {
  AutoSizer,
  List,
  CellMeasurer,
  CellMeasurerCache
} from "react-virtualized";

import { debounce } from "lodash";

const misc = require("smc-util/misc");
const { Col, Row } = require("react-bootstrap");
const { VisibleMDLG } = require("../../r_misc");

import { ProjectActions } from "../../project_actions";
import { AppRedux } from "../../app-framework";

import { NoFiles } from "./no-files";
// import { FirstSteps } from "./first-steps";
import { TerminalModeDisplay } from "./terminal-mode-display";
import { ListingHeader } from "./listing-header";
import { DirectoryRow } from "./directory-row";
import { FileRow } from "./file-row";
import { TERM_MODE_CHAR } from "./utils";

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
  other_settings?: immutable.Map<any, any>;
  show_new: boolean;
  last_scroll_top?: number;
}

export class FileListing extends React.Component<Props> {
  static defaultProps = { file_search: "" };

  private cache: CellMeasurerCache;
  private list_ref;
  private current_scroll_top: number | undefined;
  private selected_index_is_rendered: boolean | undefined;

  constructor(props) {
    super(props);

    this.cache = new CellMeasurerCache({
      fixedWidth: true,
      minHeight: 34,
      keyMapper: () => 1
    });
    this.list_ref = React.createRef();
  }

  // Restore scroll position if one was set.
  componentDidMount() {
    if (this.props.last_scroll_top != undefined) {
      this.list_ref.current.scrollToPosition(this.props.last_scroll_top);
      this.current_scroll_top = this.props.last_scroll_top;
    }
  }

  // Updates usually mean someone changed so we update (not rerender) everything.
  // This avoids doing a bunch of diffs since things probably changed.
  componentDidUpdate() {
    if (this.props.listing.length > 0) {
      this.list_ref.current.forceUpdateGrid();
    }
  }

  // Clear the selected file index if we scrolled and the index
  // is not in the render view. Prevents being unable to decide
  // Whether to scroll to selected index or old scroll position
  // on future rerender
  componentWillUnmount() {
    if (
      this.current_scroll_top != this.props.last_scroll_top &&
      !this.selected_index_is_rendered
    ) {
      this.props.actions.clear_selected_file_index();
    }
    this.props.actions.set_file_listing_scroll(this.current_scroll_top);
  }

  render_cached_row_at = ({ index, key, parent, style }) => {
    const a = this.props.listing[index];
    const row = this.render_row(
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
    return (
      <CellMeasurer
        cache={this.cache}
        columnIndex={0}
        key={key}
        rowIndex={index}
        parent={parent}
      >
        <div style={style}>{row}</div>
      </CellMeasurer>
    );
  };

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

  on_scroll = debounce(({ scrollTop }: { scrollTop: number }) => {
    this.current_scroll_top = scrollTop;
  }, SCROLL_DEBOUNCE_MS);

  on_rows_rendered = debounce(
    ({ startIndex, stopIndex }: { startIndex: number; stopIndex: number }) => {
      this.selected_index_is_rendered =
        startIndex <= this.props.selected_file_index &&
        this.props.selected_file_index <= stopIndex;
    },
    SCROLL_DEBOUNCE_MS
  );

  render_rows() {
    return (
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={this.list_ref}
            deferredMeasurementCache={this.cache}
            height={height}
            overscanRowCount={10}
            rowCount={this.props.listing.length}
            rowHeight={this.cache.rowHeight}
            rowRenderer={this.render_cached_row_at}
            width={width}
            scrollToIndex={this.props.selected_file_index}
            onScroll={this.on_scroll}
            onRowsRendered={this.on_rows_rendered}
          />
        )}
      </AutoSizer>
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
      />
    );
  }

  render_first_steps() {
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

  render_terminal_mode() {
    if (this.props.file_search[0] === TERM_MODE_CHAR) {
      return <TerminalModeDisplay />;
    }
  }

  render() {
    return (
      <>
        <Col
          sm={12}
          style={{
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            height: "100%"
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
            <Row style={{ flex: "1" }}>{this.render_rows()}</Row>
          )}
          {this.render_no_files()}
        </Col>
        <VisibleMDLG>{this.render_first_steps()}</VisibleMDLG>
      </>
    );
  }
}

const SCROLL_DEBOUNCE_MS = 32;

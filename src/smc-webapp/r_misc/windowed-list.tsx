import { ResizeObserver } from "resize-observer";
import { List, AutoSizer } from "react-virtualized";

import { React, Component, Rendered } from "../app-framework";

import * as immutable from "immutable";

interface Props {
  overscan_row_count?: number;
  estimated_row_size: number;
  row_renderer: Function;
  row_count: number;
  cell_ids: immutable.List<string>;
}

export class WindowedList extends Component<Props, {}> {
  private cell_refs: { [id: string]: any } = {};
  private list_ref;
  private row_heights_cache: { [id: string]: number } = {};
  private resize_observer: ResizeObserver;

  constructor(props) {
    super(props);
    this.list_ref = React.createRef();
    this.resize_observer = new ResizeObserver(this.cell_resized.bind(this));
  }

  public scrollToRow(row: number): void {
    this.list_ref.current.scrollToRow(row);
  }

  public scrollToPosition(pos: number): void {
    this.list_ref.current.scrollToPosition(pos);
  }

  private cell_resized(entries: any[]): void {
    let n: number = 0;
    for (let entry of entries) {
      const id = $(entry.target).attr("data-id"); // TODO: don't use jQuery
      if (
        id == null ||
        isNaN(entry.contentRect.height) ||
        entry.contentRect.height === 0 ||
        this.row_heights_cache[id] == entry.contentRect.height
      ) {
        // not really changed or just disappeared from DOM... so continue
        // using what we have cached (or the default).
        continue;
      }
      delete this.row_heights_cache[id];
      n += 1;
    }
    if (n > 0) this.list_ref.current.recomputeRowHeights();
  }

  private row_renderer({ index, style }): Rendered {
    const id = this.props.cell_ids.get(index);
    if (id == null) return;
    return (
      <div style={style} key={id}>
        <div
          data-id={id}
          ref={node => {
            if (node == null) return;
            this.cell_refs[id] = $(node);
            this.resize_observer.observe(node);
          }}
        >
          {this.props.row_renderer(id)}
        </div>
      </div>
    );
  }

  private row_height({ index }): number {
    const id = this.props.cell_ids.get(index);
    if (id == null) return this.props.estimated_row_size;

    let h = this.row_heights_cache[id];
    if (h !== undefined) return h;

    const elt = this.cell_refs[id];
    if (elt == null) return this.props.estimated_row_size;
    h = elt.height();
    if (h === 0) return this.props.estimated_row_size;
    if (h == null) {
      h = this.row_heights_cache[id];
    } else {
      this.row_heights_cache[id] = h;
    }
    return h ? h : this.props.estimated_row_size;
  }

  public render(): Rendered {
    return (
      <div
        className="smc-vfill"
        style={{ width: "100%" }}
        key={"list-of-cells"}
      >
        <AutoSizer>
          {({ height, width }) => {
            return (
              <List
                ref={this.list_ref}
                height={height}
                width={width}
                overscanRowCount={3}
                estimatedRowSize={this.props.estimated_row_size}
                rowHeight={this.row_height.bind(this)}
                rowCount={this.props.row_count}
                rowRenderer={this.row_renderer.bind(this)}
              />
            );
          }}
        </AutoSizer>
      </div>
    );
  }
}

/*



NOTES:
 - this may be very relevant: https://github.com/bvaughn/react-window/issues/6
*/

import { ResizeObserver } from "resize-observer";
import { List, AutoSizer } from "react-virtualized";

import { React, Component, Rendered } from "../app-framework";

interface Props {
  overscan_row_count: number; // how many not visible cells to render on each side of window
  estimated_row_size: number; // estimate to use for the row size before measuring
  row_count: number; // number of rows
  row_renderer: (obj: { key?: string; index?: number }) => Rendered; // renders row with given key (or index).
  row_key: (index: number) => string | undefined; // map from row number to string key; must have unique stable keys!
  scroll_to_index?: number;
}

export class WindowedList extends Component<Props, {}> {
  private cell_refs: { [key: string]: any } = {};
  private list_ref;
  private row_heights_cache: { [key: string]: number } = {};
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
      const key = $(entry.target).attr("data-key"); // TODO: don't use jQuery, or just use https://github.com/souporserious/react-measure
      if (
        key == null ||
        isNaN(entry.contentRect.height) ||
        entry.contentRect.height === 0 ||
        this.row_heights_cache[key] == entry.contentRect.height
      ) {
        // not really changed or just disappeared from DOM... so continue
        // using what we have cached (or the default).
        continue;
      }
      delete this.row_heights_cache[key];
      n += 1;
    }
    if (n > 0) this.list_ref.current.recomputeRowHeights();
  }

  public recompute() : void {
    this.list_ref.current.recomputeRowHeights()
  }

  private row_renderer({ index, style }): Rendered {
    const key = this.props.row_key(index);
    if (key == null) return;
    /* We use flex in the first nested div below so that the
       div expands to its contents. See
       https://stackoverflow.com/questions/1709442/make-divs-height-expand-with-its-content
    */
    return (
      <div style={style} key={key}>
        <div
          style={{ display: "flex", flexDirection: "column" }}
          data-key={key}
          ref={node => {
            if (node == null) return;
            this.cell_refs[key] = $(node);
            this.resize_observer.observe(node);
          }}
        >
          {this.props.row_renderer({ key, index })}
        </div>
      </div>
    );
  }

  private row_height({ index }): number {
    const key = this.props.row_key(index);
    if (key == null) return this.props.estimated_row_size;

    let h = this.row_heights_cache[key];
    if (h !== undefined) return h;

    const elt = this.cell_refs[key];
    if (elt == null) return this.props.estimated_row_size;
    h = elt.height();
    if (h === 0) return this.props.estimated_row_size;
    if (h == null) {
      h = this.row_heights_cache[key];
    } else {
      this.row_heights_cache[key] = h;
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
                scrollToIndex={this.props.scroll_to_index}
              />
            );
          }}
        </AutoSizer>
      </div>
    );
  }
}

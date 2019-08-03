/*



NOTES:
 - this may be very relevant: https://github.com/bvaughn/react-window/issues/6
*/
import { delay } from "awaiting";
import { ResizeObserver } from "resize-observer";
import { List, AutoSizer } from "react-virtualized";

import { React, Component, Rendered } from "../app-framework";

interface Props {
  overscan_row_count: number; // how many not visible cells to render on each side of window
  estimated_row_size: number; // estimate to use for the row size before measuring
  row_count: number; // number of rows
  row_renderer: (obj: { key: string; index: number }) => Rendered; // renders row with given key (or index).
  row_key: (index: number) => string | undefined; // map from row number to string key; must have unique stable keys!
  scroll_to_index?: number; // moves to this row during next render (but doesn't get stuck there!)
  scroll_top?: number;
  cache_id?: string; // if set, the measured cell sizes and scroll position are preserved between unmount/mounts
  on_scroll?: (scroll_top: number) => void;
}

interface State {
  scroll_to_index?: number;
  scroll_top?: number;
}

// TODO: this should be an LRU cache, to avoid a longterm memory leak.
const scroll_top_cache: {
  [cache_id: string]: {
    scroll_top: number;
    row_heights_cache: { [key: string]: number };
  };
} = {};

export class WindowedList extends Component<Props, State> {
  private cell_refs: { [key: string]: any } = {};
  private list_ref;
  private row_heights_cache: { [key: string]: number } = {};
  private resize_observer: ResizeObserver;
  private is_mounted: boolean = true;

  constructor(props) {
    super(props);
    this.list_ref = React.createRef();
    this.resize_observer = new ResizeObserver(this.cell_resized.bind(this));
    let scroll_top: number | undefined = props.scroll_top;
    if (scroll_top == null && this.props.cache_id != null) {
      const x = scroll_top_cache[this.props.cache_id];
      if (x != null) {
        scroll_top = x.scroll_top;
        this.row_heights_cache = x.row_heights_cache;
      }
    }
    this.state = { scroll_to_index: props.scroll_to_index, scroll_top };
  }

  public componentWillUnmount(): void {
    this.is_mounted = false;
  }

  public scrollToRow(row: number): void {
    this.list_ref.current.scrollToRow(row);
  }

  public scrollToPosition(pos: number): void {
    this.list_ref.current.scrollToPosition(pos);
  }

  public get_scrollTop(): number {
    if (this.props.cache_id == null) {
      throw Error("you must set the cache_id before using get_scrollTop");
    }
    const x = scroll_top_cache[this.props.cache_id as string];
    if (x == null) return 0;
    return x.scroll_top;
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

  public recompute(): void {
    this.list_ref.current.recomputeRowHeights();
  }

  private row_renderer({ index, style }): Rendered {
    if (index == null) return;
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

  private async scroll_after_measure(): Promise<void> {
    const { scroll_to_index, scroll_top } = this.state;
    if (scroll_to_index == null && scroll_top == null) {
      return;
    }
    // Do this so it only scrolls to this index or position once. Otherwise, things
    // are horribly broken on scroll after using scroll_to_index.
    await delay(1);
    if (!this.is_mounted) return;
    this.setState({
      scroll_to_index: undefined,
      scroll_top: undefined
    });
  }

  public render(): Rendered {
    let on_scroll: undefined | Function = undefined;
    if (this.props.cache_id != null || this.props.on_scroll != null) {
      on_scroll = x => {
        if (this.props.on_scroll != null) {
          this.props.on_scroll(x);
        }
        if (this.props.cache_id != null) {
          scroll_top_cache[this.props.cache_id as string] = {
            scroll_top: x.scrollTop,
            row_heights_cache: this.row_heights_cache
          };
        }
      };
    }
    return (
      <div
        className="smc-vfill"
        style={{ width: "100%" }}
        key={"list-of-cells"}
      >
        <AutoSizer>
          {({ height, width }) => {
            const elt = (
              <List
                ref={this.list_ref}
                height={height}
                width={width}
                overscanRowCount={3}
                estimatedRowSize={this.props.estimated_row_size}
                rowHeight={this.row_height.bind(this)}
                rowCount={this.props.row_count}
                rowRenderer={this.row_renderer.bind(this)}
                scrollToIndex={this.state.scroll_to_index}
                scrollTop={this.state.scroll_top}
                onScroll={on_scroll}
              />
            );
            this.scroll_after_measure();
            return elt;
          }}
        </AutoSizer>
      </div>
    );
  }
}

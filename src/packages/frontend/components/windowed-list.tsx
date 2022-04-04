/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* WARNING/TODO:

   scroll_to_index does basically NOTHING right now.
   This is due to an API change in react-window,
   which I just found by installing @types/react-window.
*/

// Windowed List, based on react-window:
//
// - automatically handles rows changing sizes, which I guess solves this problem?  https://github.com/bvaughn/react-window/issues/6
//
// - handles maintaining sroll position between unmount/mount
//
// - We use react-window instead of react-virtualized, since react-window is
//   enough for our needs, is faster, is smaller, and seems to work better.
//   I did implement everything first using react-virtualized, but react-window
//   is definitely faster, and the overscan seems to work much better.

import { MutableRefObject, ReactNode } from "react";
import { delay } from "awaiting";
import ResizeObserver from "resize-observer-polyfill";
import { VariableSizeList as List, ListOnScrollProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  React,
  Component,
  Rendered,
  CSS,
} from "@cocalc/frontend/app-framework";

const SHRINK_THRESH: number = 3;
const BIG: number = 9999999;

export interface ScrollInfo extends ListOnScrollProps {
  maxScrollOffset?: number;
}

export type ControlRef = MutableRefObject<{
  renderInfo: RenderInfo;
  scrollInfo: ScrollInfo;
  scrollTo: (offset: number) => void;
  scrollToItem: (index: number, align?) => void;
}>;

export interface Props {
  overscan_row_count: number; // how many not visible cells to render on each side of window
  estimated_row_size: number; // estimate to use for the row size before measuring
  row_size_estimator?: (index: number) => number | undefined; // optional row size estimator
  row_count: number; // number of rows
  row_renderer: (obj: {
    key: string;
    index: number;
    isScrolling?: boolean;
    isVisible?: boolean;
  }) => ReactNode; // renders row with given key (or index).
  row_key: (index: number) => string | undefined; // map from row number to string key; must have unique stable keys!
  scroll_to_index?: number; // moves to this row during next render (but doesn't get stuck there!)
  scroll_top?: number;
  cache_id?: string; // if set, the measured cell sizes and scroll position are preserved between unmount/mounts
  on_scroll?: (info: ScrollInfo) => void;
  use_is_scrolling?: boolean;
  hide_resize?: boolean;
  render_info?: boolean; // if true, record RenderInfo; also makes isVisible available for row_renderer.
  scroll_margin?: number;
  row_style?: CSS;

  // no_shrink_hack: ignore resizes that shrink or barely change size;
  // useful in some cases, but very bad in others.
  no_shrink_hack?: boolean;

  // Plan to rewrite all code to use this ref rather than a ref to the whole class.
  // That way we can switch to a functional component. Add more fields as needed
  // for clients, but no JSX.Elements, so this remains JSON'able.
  controlRef?: ControlRef;
}

interface State {
  scroll_to_index?: number;
  scroll_top?: number;
}

interface RenderInfo {
  overscanStartIndex: number;
  overscanStopIndex: number;
  visibleStartIndex: number;
  visibleStopIndex: number;
}

// TODO: this should be an LRU cache, to avoid a longterm memory leak.
const scroll_cache: {
  [cache_id: string]: {
    info: ListOnScrollProps;
    row_heights_cache: { [key: string]: number };
  };
} = {};

export class WindowedList extends Component<Props, State> {
  private no_shrink_hack: boolean = false;
  private cell_refs: { [key: string]: any } = {};
  private list_ref;
  private row_heights_cache: { [key: string]: number } = {};
  private row_heights_stale: { [key: string]: boolean } = {};
  public resize_observer: any; // ResizeObserver, but can't because that's only for the polyfill...
  private is_mounted: boolean = true;
  private _disable_refresh: boolean = false;
  private RowComponent: any;
  private height: number = 0;
  private width: number = 0;
  private scroll_info: ScrollInfo = {
    scrollDirection: "forward",
    scrollOffset: 0,
    scrollUpdateWasRequested: false,
  };

  private min_changed_index: number = 0;

  public render_info: RenderInfo = {
    overscanStartIndex: 0,
    overscanStopIndex: 0,
    visibleStartIndex: 0,
    visibleStopIndex: 0,
  };
  private ensure_visible?: { row: number; align: string };
  private controlRef?: ControlRef;

  constructor(props) {
    super(props);
    this.no_shrink_hack = props.no_shrink_hack;
    this.list_ref = React.createRef();
    this.resize_observer = new ResizeObserver((entries) =>
      // We wrap it in requestAnimationFrame to avoid this error - ResizeObserver loop limit exceeded
      // See https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded
      // This overflow happens frequently on Safari and results in glitchy behavior.
      window.requestAnimationFrame(() => this.rows_resized(entries))
    );
    let scroll_top: number | undefined = props.scroll_top;
    if (scroll_top == null && this.props.cache_id != null) {
      const x = scroll_cache[this.props.cache_id];
      if (x != null) {
        scroll_top = x.info.scrollOffset;
        this.row_heights_cache = x.row_heights_cache;
      }
    }
    this.state = { scroll_to_index: props.scroll_to_index, scroll_top };
    this.RowComponent = createRowComponent(this);

    if (props.controlRef != null) {
      this.controlRef = props.controlRef;
      props.controlRef.current = {
        scrollTo: this.scrollTo.bind(this),
        scrollToItem: this.scrollToItem.bind(this),
        renderInfo: this.render_info,
        scrollInfo: this.scroll_info,
      };
    }
  }

  public componentWillUnmount(): void {
    this.is_mounted = false;
  }

  // NOTE: avoid using "auto" as it is somewhat random and can be confusing.
  // Try to specify one of these explicitly for align:
  //      auto, end, start, center, top
  public async scrollToRow(row: number, align: string = "auto"): Promise<void> {
    if (this.list_ref.current == null || this.props.row_count == 0) return;
    if (row < 0) {
      row = row % this.props.row_count;
      if (row < 0) {
        row += this.props.row_count;
      }
    }

    if (align == "top") {
      // react-window doesn't have align=top, but we **need** it for jupyter
      // This implementation isn't done; it's just to prove we can do it.
      // Here "top" means the top of the row is in view nicely.
      // NOTE: I ripped out all use of WindowedList from our Jupyter so no
      // longer needed... but maybe I'll add it back someday (probably off by default).
      this.scrollToRow(row, "auto"); // at least get it into view, so metadata useful.
      const meta = this.get_row_metadata(row);
      if (meta == null) {
        return;
      }
      const { scrollOffset } = this.get_scroll_info();
      const height = this.get_window_height();
      const margin = this.props.scroll_margin ? this.props.scroll_margin : 10;
      let delta: number = 0;
      if (meta.offset >= scrollOffset + height - margin) {
        // cell is too far down
        delta = meta.offset - (scrollOffset + height - margin);
      } else if (meta.offset <= scrollOffset + margin) {
        // cell is too far up
        delta = meta.offset - (scrollOffset + margin);
      }
      if (delta != 0) {
        this.scrollToPosition(scrollOffset + delta);
      }
    } else {
      // align is auto, end, start, center
      while (this.is_mounted) {
        const total_height = this.get_total_height();
        this.list_ref.current.scrollToItem(row, align);
        await delay(250);
        if (this.get_total_height() <= total_height) {
          // total height didn't increase as a result of scrolling...
          break;
        }
      }
    }
  }

  public async ensure_row_is_visible(
    row: number,
    align: string = "auto"
  ): Promise<void> {
    this.ensure_visible = { row, align };
    for (let i = 1; i < 10; i++) {
      const { row, align } = this.ensure_visible;
      this.scrollToRow(row, align);
      await delay(30);
      if (!this.is_mounted) return;
      if (
        this.render_info != null &&
        this.render_info.visibleStartIndex <= row &&
        row <= this.render_info.visibleStopIndex
      ) {
        return;
      }
    }
  }

  public get_row_metadata(
    row: number
  ): { offset: number; size: number } | undefined {
    if (this.list_ref.current == null) return;
    const instanceProps = this.list_ref.current._instanceProps;
    if (instanceProps == null) return;
    const { itemMetadataMap } = instanceProps;
    if (itemMetadataMap == null) return;
    return itemMetadataMap[row];
  }

  public get_window_height(): number {
    return this.height;
  }

  public get_window_width(): number {
    return this.width;
  }

  public get_total_height(): number {
    const meta = this.get_row_metadata(this.props.row_count - 1);
    if (meta == null) return 0;
    return meta.offset + meta.size;
  }

  public get_scroll_info(): any {
    return this.scroll_info;
  }

  public scrollToPosition(pos: number): void {
    if (this.list_ref.current == null || pos == null) return;
    this.list_ref.current.scrollTo(pos);
  }

  // Last scroll info
  public get_scroll(): ListOnScrollProps | undefined {
    if (this.props.cache_id == null) {
      throw Error("you must set the cache_id before using get_scroll");
    }
    const x = scroll_cache[this.props.cache_id as string];
    if (x == null) return;
    return x.info;
  }

  /* Call when a row may have changed size.  */
  private row_resized(entry): void {
    const elt = entry.target;
    const key = elt.getAttribute("data-key");
    if (key == null) return;
    // NOTE: We use this jQuery instead of entry.contentRect.height,
    // since in some cases (e.g., codemirror editors), using
    // entry.contentRect.height would be wrong just as they
    // were being mounted/refreshed, but height() seems always right.
    const height = $(entry.target).height();
    // We never resize to exactly 0.  If you need to hide something,
    // resize it to a small positive number...
    if (height == null || isNaN(height) || height == 0) {
      return;
    }

    const index = elt.getAttribute("data-index");
    const s = height - this.row_heights_cache[key];
    if (
      this.no_shrink_hack &&
      ((s < 0 && -s <= SHRINK_THRESH) || Math.abs(s) < 0.1)
    ) {
      // just shrunk or barely changed,
      // ... so continue using what we have cached (or the default).
      return;
    }
    if (index != null) {
      this.min_changed_index = Math.min(
        this.min_changed_index,
        parseInt(index)
      );
    }
    this.row_heights_stale[key] = true;
  }

  private rows_resized(entries: any[]): void {
    for (const entry of entries) {
      this.row_resized(entry);
    }
    if (this.min_changed_index != BIG) {
      this.refresh();
    }
  }

  public disable_refresh(): void {
    this._disable_refresh = true;
  }

  public enable_refresh(): void {
    this._disable_refresh = false;
  }

  public refresh(): void {
    if (this._disable_refresh) return;
    if (this.list_ref.current == null) return;
    this.list_ref.current.resetAfterIndex(this.min_changed_index, true);
    this.min_changed_index = BIG;
  }

  public row_ref(key: string): any {
    return this.cell_refs[key];
  }

  public row_height(index: number): number {
    const key = this.props.row_key(index);
    if (key == null) return 0;

    let h = this.row_heights_cache[key];
    if (h !== undefined && !this.row_heights_stale[key]) {
      return h;
    }
    if (h === undefined) {
      h = 0;
    }

    const elt = this.cell_refs[key];
    if (elt == null) {
      return h
        ? h
        : this.props.row_size_estimator?.(index) ??
            this.props.estimated_row_size;
    }

    let ht = elt.height();
    if (Math.abs(h - ht) <= SHRINK_THRESH) {
      // don't shrink if there are little jiggles.
      ht = Math.max(h, ht);
    }
    if (ht === 0) {
      return h
        ? h
        : this.props.row_size_estimator?.(index) ??
            this.props.estimated_row_size;
    }

    if (
      this.row_heights_cache[key] == undefined ||
      this.row_heights_stale[key]
    ) {
      this.row_heights_cache[key] = ht;
      delete this.row_heights_stale[key];
    }

    return ht;
  }

  private async scroll_after_measure(): Promise<void> {
    const { scroll_to_index, scroll_top } = this.state;
    if (scroll_to_index == null && scroll_top == null) {
      return;
    }
    // Do this so it only scrolls to this index or position once.
    // Otherwise, things are horribly broken on scroll after using
    // scroll_to_index.
    await delay(1);
    if (!this.is_mounted) return;
    this.setState({
      scroll_to_index: undefined,
      scroll_top: undefined,
    });
  }

  public scrollToItem(index: number, align?): void {
    this.list_ref.current?.scrollToItem(index, align);
  }

  public scrollTo(offset: number): void {
    this.list_ref.current?.scrollTo(offset);
  }

  public render(): Rendered {
    let on_scroll: undefined | ((info: ListOnScrollProps) => void) = undefined;
    if (this.props.cache_id != null || this.props.on_scroll != null) {
      on_scroll = (info: ListOnScrollProps): void => {
        const a = $(this.list_ref.current?._outerRef);
        let maxScrollOffset = 0;
        if (a != null && a[0] != null) {
          maxScrollOffset = a[0].scrollHeight - (a.height() ?? 0);
        }
        this.scroll_info = {
          ...info,
          ...{ maxScrollOffset },
        };
        if (this.controlRef?.current != null) {
          this.controlRef.current.scrollInfo = this.scroll_info;
        }
        if (this.props.on_scroll != null) {
          this.props.on_scroll(this.scroll_info);
        }
        if (this.props.cache_id != null) {
          scroll_cache[this.props.cache_id as string] = {
            info: this.scroll_info,
            row_heights_cache: this.row_heights_cache,
          };
        }
      };
    }

    const save_render_info = this.props.render_info
      ? (info) => {
          this.render_info = info;
          if (this.controlRef?.current != null) {
            this.controlRef.current.renderInfo = info;
          }
        }
      : undefined;

    // NOTE: WebkitUserSelect here and also in the row component
    // below together make it so that on **Safari** you don't visibly
    // see the containing div get selected whenever you try to select
    // several elements of a windowed list.  This helps enormously
    // with slate.js + windowing on safari.  On chrome and firefox
    // this isn't a problem, but also the extra CSS rule doesn't hurt.
    return (
      <div
        className="smc-vfill"
        style={{ width: "100%", WebkitUserSelect: "none" }}
        key={"list-of-cells"}
      >
        <AutoSizer>
          {({ height, width }) => {
            this.height = height;
            this.width = width;
            const elt = (
              <List
                ref={this.list_ref}
                height={height}
                width={width}
                overscanCount={this.props.overscan_row_count}
                estimatedItemSize={this.props.estimated_row_size}
                itemSize={this.row_height.bind(this)}
                itemCount={this.props.row_count}
                initialScrollOffset={this.state.scroll_top}
                onScroll={on_scroll}
                useIsScrolling={this.props.use_is_scrolling}
                onItemsRendered={save_render_info}
              >
                {this.RowComponent}
              </List>
            );
            this.scroll_after_measure();
            return elt;
          }}
        </AutoSizer>
      </div>
    );
  }
}

interface RowRendererProps {
  index: number;
  style: React.CSSProperties;
  isScrolling?: boolean;
}

function createRowComponent(windowed_list: WindowedList) {
  const RowComponent: React.FC<RowRendererProps> = (
    props: RowRendererProps
  ) => {
    function render_wrap(
      index: number,
      key: string,
      isScrolling?: boolean
    ): Rendered {
      let isVisible: boolean | undefined;
      if (windowed_list.props.render_info) {
        isVisible =
          index >= windowed_list.render_info.visibleStartIndex &&
          index <= windowed_list.render_info.visibleStopIndex;
      }
      return (
        <div
          style={{
            ...windowed_list.props.row_style,
            ...{
              display: "flex",
              flexDirection: "column",
              WebkitUserSelect: "text",
            },
          }}
          data-key={key}
          data-index={index}
          ref={(node) => {
            if (node == null) return;
            (windowed_list as any).cell_refs[key] = $(node);
            (windowed_list as any).resize_observer.observe(node);
          }}
        >
          {windowed_list.props.row_renderer({
            key,
            index,
            isScrolling,
            isVisible,
          })}
        </div>
      );
    }

    const { index, style, isScrolling } = props;
    const key = windowed_list.props.row_key(index);
    if (key == null) return <div />;

    /* We use flex in the first nested div below so that the
       div expands to its contents. See
       https://stackoverflow.com/questions/1709442/make-divs-height-expand-with-its-content
      */
    let wrap = render_wrap(index, key, isScrolling);
    if (windowed_list.props.hide_resize) {
      wrap = <div style={{ overflow: "hidden", height: "100%" }}>{wrap}</div>;
    }
    return (
      <div style={style} key={`${index}-${key}`}>
        {wrap}
      </div>
    );
  };
  return RowComponent;
}

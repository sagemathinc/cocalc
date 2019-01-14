/*
This is a renderer using pdf.js.
*/

// We render pages within a window of this many pixels around
// the top of the visible page.  Making this bigger makes it
// less likely the user will see a blank page for a moment, but
// also potentially makes things feel slightly slower and heavier.
const WINDOW_SIZE: number = 3000;
const HIGHLIGHT_TIME_S: number = 3;

const { Icon, Loading } = require("smc-webapp/r_misc");

import { delay } from "awaiting";
import { Map, Set } from "immutable";
import { throttle } from "underscore";
import * as $ from "jquery";
import { is_different, seconds_ago, list_alternatives } from "smc-util/misc2";
import { dblclick } from "./mouse-click";
import {
  Component,
  Fragment,
  React,
  ReactDOM,
  rclass,
  rtypes,
  Rendered
} from "../../app-framework";
import { getDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { Page, PAGE_GAP } from "./pdfjs-page";
import { SyncHighlight } from "./pdfjs-annotation";
import { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/webpack";

// Ensure this jQuery plugin is defined:
import "./mouse-draggable";

interface PDFJSProps {
  id: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;
  renderer: string /* "canvas" or "svg" */;
  is_current: boolean;
  status: string;

  // reduxProps
  zoom_page_width?: string;
  zoom_page_height?: string;
  sync?: string;
  scroll_pdf_into_view?: { page: number; y: number; id: string };
  mode: undefined | "rmd";
  derived_file_types: Set<string>;
}

interface PDFJSState {
  loaded: boolean;
  doc: PDFDocumentProxy;
  pages: PDFPageProxy[];
  scrollTop: number;
  missing: boolean;
  restored_scroll: boolean;
}

class PDFJS extends Component<PDFJSProps, PDFJSState> {
  private mounted: boolean;

  constructor(props) {
    super(props);

    let scroll: number = 0;
    if (this.props.editor_state) {
      let x = this.props.editor_state.getIn(["scroll", "top"]);
      if (x) scroll = x;
    }

    this.state = {
      loaded: false,
      doc: { pdfInfo: { fingerprint: "" } },
      pages: [],
      scrollTop: scroll,
      missing: false,
      restored_scroll: false
    };
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        zoom_page_width: rtypes.string,
        zoom_page_height: rtypes.string,
        sync: rtypes.string,
        scroll_pdf_into_view: rtypes.object
      }
    };
  }

  shouldComponentUpdate(
    next_props: PDFJSProps,
    next_state: PDFJSState
  ): boolean {
    return (
      is_different(
        this.props,
        next_props,
        [
          "reload",
          "font_size",
          "renderer",
          "path",
          "zoom_page_width",
          "zoom_page_height",
          "sync",
          "scroll_pdf_into_view",
          "is_current",
          "status",
          "derived_file_types"
        ]
      ) ||
      is_different(this.state, next_state, [
        "loaded",
        "scrollTop",
        "missing",
        "restored_scroll"
      ]) ||
      this.state.doc.pdfInfo.fingerprint != next_state.doc.pdfInfo.fingerprint
    );
  }

  render_status(): Rendered {
    if (this.props.status) {
      return <Loading text="Building..." />;
    } else {
      return (
        <Fragment>
          <Icon name="play-circle" /> Build or fix
        </Fragment>
      );
    }
  }

  render_missing(): Rendered {
    return (
      <div
        style={{
          fontSize: "20pt",
          color: "#666"
        }}
      >
        Missing PDF -- {this.render_status()}
      </div>
    );
  }

  render_loading(): Rendered {
    return <Loading theme="medium" />;
  }

  on_scroll(): void {
    if (!this.state.restored_scroll) return;
    let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    const scroll = { top: elt.scrollTop(), left: elt.scrollLeft() };
    this.props.actions.save_editor_state(this.props.id, { scroll });
    if (scroll.top !== undefined) {
      this.setState({ scrollTop: scroll.top });
    }
  }

  async restore_scroll(): Promise<void> {
    await this._restore_scroll(0);
    this.setState({ restored_scroll: true });
  }

  async _restore_scroll(wait?: number): Promise<void> {
    if (wait !== undefined) {
      await delay(wait);
    }
    if (!this.mounted || !this.props.editor_state) return;
    const scroll: Map<string, number> = this.props.editor_state.get("scroll");
    if (!scroll) return;
    let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    elt.scrollTop(scroll.get("top", 0));
    elt.scrollLeft(scroll.get("left", 0));
  }

  async load_doc(reload: number): Promise<void> {
    try {
      const doc: PDFDocumentProxy = await getDocument(
        url_to_pdf(this.props.project_id, this.props.path, reload)
      );
      if (!this.mounted) return;
      this.setState({ missing: false });
      let v: Promise<PDFPageProxy>[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        v.push(doc.getPage(n));
      }
      let pages: PDFPageProxy[] = await Promise.all(v);
      if (!this.mounted) return;
      this.setState({
        doc: doc,
        loaded: true,
        pages: pages,
        missing: false
      });
    } catch (err) {
      // This is normal if the PDF is being modified *as* it is being loaded...
      if (this.mounted && err.toString().indexOf("Missing") != -1) {
        this.setState({ missing: true });
      }
      console.log(`WARNING: error loading PDF -- ${err}`);
      //this.props.actions.set_error();
    }
  }

  async scroll_pdf_into_view(
    page: number,
    y: number,
    id: string
  ): Promise<void> {
    if (id != this.props.id) {
      // not set to *this* viewer, so ignore.
      return;
    }
    let is_ready = () => {
      return this.state.doc != null && this.state.doc.getPage != null;
    };
    let i = 0;
    while (i < 50 && !is_ready()) {
      // doc can be defined but not doc.getPage.
      // can't scroll document into position if we haven't even loaded it yet.  Just do nothing in this case.
      await delay(100);
      if (!this.mounted) return;
      i += 1;
    }
    if (!is_ready()) {
      // give up.
      return;
    }
    const doc = this.state.doc;

    /*
        We iterative through each page in the document, determine its height, and add that
        to a running total, along with the gap between pages.  Once we get to the given page,
        we then just add y.  We then scroll the containing div down to that position.
        */
    // Get all pages before page we are scrolling to in parallel.
    let page_promises: PDFPageProxy[] = [];
    for (let n = 1; n <= page; n++) {
      page_promises.push(doc.getPage(n));
    }

    let pages;
    try {
      pages = await Promise.all(page_promises);
    } catch (err) {
      this.props.actions.set_error(
        `error scrolling PDF into position -- ${err}`
      );
    }

    await delay(0);
    if (!this.mounted) return;

    const scale = this.scale();
    let s: number = PAGE_GAP + y * scale;
    for (let page of pages.slice(0, pages.length - 1)) {
      s += scale * page.pageInfo.view[3] + PAGE_GAP;
    }
    let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    let height = elt.height();
    if (!height) return;
    s -= height / 2;
    elt.scrollTop(s);
    i = 0;
    do {
      i += 1;
      await delay(100);
      if (!this.mounted) return;
      elt.scrollTop(s);
    } while (i < 50 && Math.abs((elt.scrollTop() as number) - s) > 10);
    this.props.actions.setState({ scroll_pdf_into_view: undefined });
  }

  componentWillReceiveProps(next_props: PDFJSProps): void {
    if (next_props.zoom_page_width == next_props.id) {
      this.zoom_page_width();
    }
    if (next_props.zoom_page_height == next_props.id) {
      this.zoom_page_height();
    }
    if (next_props.sync == next_props.id) {
      this.sync();
    }
    if (this.props.reload != next_props.reload) {
      this.load_doc(next_props.reload);
    }
    if (
      this.props.scroll_pdf_into_view !== next_props.scroll_pdf_into_view &&
      next_props.scroll_pdf_into_view
    ) {
      let { page, y, id } = next_props.scroll_pdf_into_view;
      this.scroll_pdf_into_view(page, y, id);
    }
    if (
      this.props.is_current != next_props.is_current &&
      next_props.is_current
    ) {
      // ensure any codemirror (etc.) elements blur, when this pdfjs viewer is focused.
      ($ as any)(document.activeElement).blur();
      $(ReactDOM.findDOMNode(this.refs.scroll)).focus();
    }
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  mouse_draggable(): void {
    $(ReactDOM.findDOMNode(this.refs.scroll)).mouse_draggable();
  }

  async scroll_click(evt, scroll): Promise<void> {
    scroll.focus();
    if (this.props.is_current) {
      return;
    }
    evt.stopPropagation(); // stop propagation to focus doesn't land on *individual page*
    this.props.actions.set_active_id(this.props.id); // fix side effect of stopping propagation.
    // wait an do another focus -- critical or keyboard navigation is flakie.
    await delay(0);
    scroll.focus();
  }

  focus_on_click(): void {
    let scroll = $(ReactDOM.findDOMNode(this.refs.scroll));
    scroll.on("click", evt => this.scroll_click(evt, scroll));
  }

  async zoom_page_width(): Promise<void> {
    this.props.actions.setState({ zoom_page_width: undefined }); // we got the message.
    let page;
    try {
      page = await this.state.doc.getPage(1);
      if (!this.mounted) return;
    } catch (err) {
      return; // Can't load, maybe there is no page 1, etc...
    }
    let width = $(ReactDOM.findDOMNode(this.refs.scroll)).width();
    if (width === undefined) return;
    let scale = (width - 10) / page.pageInfo.view[2];
    this.props.actions.set_font_size(this.props.id, this.font_size(scale));
  }

  async zoom_page_height(): Promise<void> {
    this.props.actions.setState({ zoom_page_height: undefined });
    let page;
    try {
      page = await this.state.doc.getPage(1);
      if (!this.mounted) return;
    } catch (err) {
      return;
    }
    let height = $(ReactDOM.findDOMNode(this.refs.scroll)).height();
    if (height === undefined) return;
    let scale = (height - 10) / page.pageInfo.view[3];
    this.props.actions.set_font_size(this.props.id, this.font_size(scale));
  }

  sync(): void {
    this.props.actions.setState({ sync: undefined });
    let e = $(ReactDOM.findDOMNode(this.refs.scroll));
    let offset = e.offset(),
      height = e.height();
    if (!offset || !height) return;
    dblclick(offset.left, offset.top + height / 2);
  }

  componentDidMount(): void {
    this.mounted = true;
    this.mouse_draggable();
    this.focus_on_click();
    this.load_doc(this.props.reload);
  }

  render_pages(): Rendered[] {
    const pages: Rendered[] = [];
    const scale = this.scale();
    let scrollTop: number = this.state.scrollTop;
    let top: number = 0;
    for (let n = 1; n <= this.state.doc.numPages; n++) {
      let page = this.state.pages[n - 1];
      let renderer: string = "none";
      if (
        top >= scrollTop - WINDOW_SIZE * scale &&
        top <= scrollTop + WINDOW_SIZE * scale
      ) {
        renderer = this.props.renderer;
      }
      let sync_highlight: SyncHighlight | undefined;
      if (
        this.props.scroll_pdf_into_view !== undefined &&
        this.props.scroll_pdf_into_view.page === n &&
        this.props.scroll_pdf_into_view.id === this.props.id
      ) {
        sync_highlight = {
          y: this.props.scroll_pdf_into_view.y,
          until: seconds_ago(-HIGHLIGHT_TIME_S)
        };
      } else {
        sync_highlight = undefined;
      }
      pages.push(
        <Page
          id={this.props.id}
          actions={this.props.actions}
          doc={this.state.doc}
          page={page}
          n={n}
          key={n}
          renderer={renderer}
          scale={scale}
          sync_highlight={sync_highlight}
        />
      );
      top += scale * page.pageInfo.view[3] + PAGE_GAP;
    }
    if (!this.state.restored_scroll) {
      // Restore the scroll position after the pages get
      // rendered into the DOM.
      this.restore_scroll();
    }
    return pages;
  }

  render_content(): Rendered | Rendered[] {
    if (!this.state.loaded) {
      if (this.state.missing) {
        return this.render_missing();
      } else {
        return this.render_loading();
      }
    } else {
      return (
        <div
          style={{
            visibility: this.state.restored_scroll ? "visible" : "hidden"
          }}
        >
          {this.render_pages()}
        </div>
      );
    }
  }

  scale(): number {
    return this.props.font_size / 12;
  }

  font_size(scale: number): number {
    return 12 * scale;
  }

  render_highlight(): Rendered {
    return <div style={{ background: "yellow" }} id={"cc-highlight"} />;
  }

  render_no_pdf(): Rendered {
    return (
      <div style={{ backgroundColor: "white" }}>
        {" "}
        <p>There is no rendered PDF file available.</p>
        {this.props.derived_file_types.size > 0 ? (
          <p>
            Instead, you might want to switch to the{" "}
            {list_alternatives(this.props.derived_file_types)} view by selecting
            it via the dropdown selector in the button row above.
          </p>
        ) : (
          ""
        )}
      </div>
    );
  }

  render() {
    if (
      this.props.mode == "rmd" &&
      this.props.derived_file_types != undefined
    ) {
      if (!this.props.derived_file_types.contains("pdf")) {
        return this.render_no_pdf();
      }
    }

    return (
      <div
        style={{
          overflow: "scroll",
          width: "100%",
          cursor: "default",
          textAlign: "center",
          backgroundColor: !this.state.loaded ? "white" : undefined
        }}
        onScroll={throttle(() => this.on_scroll(), 150)}
        ref={"scroll"}
        tabIndex={
          1 /* Need so keyboard navigation works; also see mouse-draggable click event. */
        }
      >
        <div>{this.render_content()}</div>
      </div>
    );
  }
}

const PDFJS0 = rclass(PDFJS);
export { PDFJS0 as PDFJS };

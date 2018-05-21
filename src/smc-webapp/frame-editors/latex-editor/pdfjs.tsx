/*
This is a renderer using pdf.js.
*/

// We render pages within a window of this many pixels around
// the top of the visible page.  Making this bigger makes it
// less likely the user will see a blank page for a moment, but
// also potentially makes things feel slightly slower and heavier.
const WINDOW_SIZE: number = 3000;

const { Loading } = require("smc-webapp/r_misc");

import { delay } from "awaiting";
import { Map } from "immutable";
import { throttle } from "underscore";
import * as $ from "jquery";
import { is_different } from "../generic/misc";
import { dblclick } from "./mouse-click";
import {
  Component,
  React,
  ReactDOM,
  rclass,
  rtypes,
  Rendered
} from "../generic/react";
import { getDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { Page, PAGE_GAP } from "./pdfjs-page";
import { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/webpack";

// Ensure this jQuery plugin is defined:
import "./mouse-draggable.ts";

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

  // reduxProps
  zoom_page_width?: string;
  zoom_page_height?: string;
  sync?: string;
  scroll_into_view?: { page: number; y: number; id: string };
}

interface PDFJSState {
  loaded: boolean;
  doc: PDFDocumentProxy;
  pages: PDFPageProxy[];
  scrollTop: number;
}

class PDFJS extends Component<PDFJSProps, PDFJSState> {
  private mounted: boolean;
  private restored_scroll: boolean;

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
      scrollTop: scroll
    };
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        zoom_page_width: rtypes.string,
        zoom_page_height: rtypes.string,
        sync: rtypes.string,
        scroll_into_view: rtypes.object
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
          "scroll_into_view",
          "is_current"
        ]
      ) ||
      this.state.loaded != next_state.loaded ||
      this.state.scrollTop != next_state.scrollTop ||
      this.state.doc.pdfInfo.fingerprint != next_state.doc.pdfInfo.fingerprint
    );
  }

  render_loading(): Rendered {
    return <Loading theme="medium" />;
  }

  on_scroll(): void {
    let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    const scroll = { top: elt.scrollTop(), left: elt.scrollLeft() };
    this.props.actions.save_editor_state(this.props.id, { scroll });
    if (scroll.top !== undefined) {
      this.setState({ scrollTop: scroll.top });
    }
  }

  async restore_scroll(wait?: number): Promise<void> {
    if (wait !== undefined) {
      await delay(wait);
    }
    if (!this.props.editor_state || !this.mounted) return;
    this.restored_scroll = true;
    const scroll: Map<string, number> = this.props.editor_state.get("scroll");
    if (!scroll) return;
    let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    elt.scrollTop(scroll.get("top") || 0);
    elt.scrollLeft(scroll.get("left") || 0);
  }

  async load_doc(reload: number): Promise<void> {
    try {
      const doc: PDFDocumentProxy = await getDocument(
        url_to_pdf(this.props.project_id, this.props.path, reload)
      );
      if (!this.mounted) return;
      let v: Promise<PDFPageProxy>[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        v.push(doc.getPage(n));
      }
      let pages: PDFPageProxy[] = await Promise.all(v);
      if (!this.mounted) return;
      this.setState({
        doc: doc,
        loaded: true,
        pages: pages
      });
    } catch (err) {
      // This is normal if the PDF is being modified *as* it is being loaded...
      console.log(`WARNING: error loading PDF -- ${err}`);
      //this.props.actions.set_error();
    }
  }

  async scroll_into_view(page: number, y: number, id: string): Promise<void> {
    if (id && id != this.props.id) {
      // id is set, and it's not set to *this* viewer, so ignore.
      return;
    }
    this.props.actions.setState({ scroll_into_view: undefined }); // we got the message.
    const doc = this.state.doc;
    if (!doc) {
      // can't scroll document into position if we haven't even loaded it yet.  Just do nothing in this case.
      return;
    }
    /*
        We iterative through each page in the document, determine its height, and add that
        to a running total, along with the gap between pages.  Once we get to the given page,
        we then just add y.  We then scroll the containing div down to that position.
        */
    try {
      // Get all pages before page we are scrolling to in parallel.
      let page_promises: PDFPageProxy[] = [];
      for (let n = 1; n <= page; n++) {
        page_promises.push(doc.getPage(n));
      }
      let pages = await Promise.all(page_promises);
      if (!this.mounted) return;
      const scale = this.scale();
      let s = PAGE_GAP + y * scale;
      for (let page of pages.slice(0, pages.length - 1)) {
        s += scale * page.pageInfo.view[3] + PAGE_GAP;
      }
      let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
      let height = elt.height();
      if (!height) return;
      s -= height / 2;
      elt.scrollTop(s);
    } catch (err) {
      this.props.actions.set_error(
        `error scrolling PDF into position -- ${err}`
      );
    }
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
      next_props.scroll_into_view &&
      this.props.scroll_into_view !== next_props.scroll_into_view
    ) {
      let { page, y, id } = next_props.scroll_into_view;
      this.scroll_into_view(page, y, id);
    }
    if (
      this.props.is_current != next_props.is_current &&
      next_props.is_current
    ) {
      // ensure any codemirror (etc.) elements blur, when this pdfjs viewer is focused.
      $(document.activeElement).blur();
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
        />
      );
      top += scale * page.pageInfo.view[3] + PAGE_GAP;
    }
    if (!this.restored_scroll) {
      // Restore the scroll position after the above pages get
      // rendered into the DOM.
      this.restore_scroll(0);
    }
    return pages;
  }

  render_content(): Rendered | Rendered[] {
    if (!this.state.loaded) {
      return this.render_loading();
    } else {
      return this.render_pages();
    }
  }

  scale(): number {
    return this.props.font_size / 12;
  }

  font_size(scale: number): number {
    return 12 * scale;
  }

  render() {
    return (
      <div
        style={{
          overflow: "scroll",
          width: "100%",
          cursor: "default",
          textAlign: "center",
          backgroundColor: !this.state.loaded ? "white" : undefined
        }}
        onScroll={throttle(() => this.on_scroll(), 250)}
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

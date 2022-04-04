/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is a renderer using pdf.js.
// We render pages within a window of this many pixels around
// the top of the visible page.  Making this bigger makes it
// less likely the user will see a blank page for a moment, but
// also potentially makes things feel slightly slower and heavier.
const WINDOW_SIZE: number = 3000;
const HIGHLIGHT_TIME_S: number = 6;

import "./pdfjs-worker";

import { Icon, Loading, Markdown } from "@cocalc/frontend/components";
import { Alert } from "antd";
import { delay } from "awaiting";
import { Map, Set } from "immutable";
import { throttle } from "underscore";
import $ from "jquery";
import { seconds_ago, list_alternatives } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { dblclick } from "./mouse-click";
import {
  React,
  ReactDOM,
  useRedux,
  useIsMountedRef,
} from "../../app-framework";
import { getDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { Page, PAGE_GAP } from "./pdfjs-page";
import { SyncHighlight } from "./pdfjs-annotation";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/webpack";
import { EditorState } from "../frame-tree/types";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";

// Ensure this jQuery plugin is defined:
import "./mouse-draggable";

interface PDFJSProps {
  id: string;
  name: string;
  actions: any;
  editor_state: EditorState;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;
  renderer: string /* "canvas" or "svg" */;
  is_current: boolean;
  status: string;
}

export const PDFJS: React.FC<PDFJSProps> = React.memo((props: PDFJSProps) => {
  const {
    id,
    name,
    actions,
    editor_state,
    //is_fullscreen,
    project_id,
    path,
    reload,
    font_size,
    renderer,
    is_current,
    status,
  } = props;

  const isMounted = useIsMountedRef();

  const zoom_page_width = useRedux(name, "zoom_page_width");
  const zoom_page_height = useRedux(name, "zoom_page_height");
  const sync = useRedux(name, "sync");
  const scroll_pdf_into_view = useRedux(name, "scroll_pdf_into_view")?.toJS();
  const mode: undefined | "rmd" = useRedux(name, "mode");
  const derived_file_types: Set<string> = useRedux(name, "derived_file_types");
  const custom_pdf_error_message = useRedux(name, "custom_pdf_error_message");

  const [loaded, set_loaded] = React.useState<boolean>(false);
  const [pages, set_pages] = React.useState<PDFPageProxy[]>([]);
  const scroll_init = editor_state?.getIn(["scroll", "top"]) ?? 0;
  const [scrollTop, set_scrollTop] = React.useState<number>(scroll_init);
  const [missing, set_missing] = React.useState<boolean>(false);
  const [restored_scroll, set_restored_scroll] = React.useState<boolean>(false);
  const [doc, set_doc] = React.useState<PDFDocumentProxy | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  usePinchToZoom({ target: scrollRef });

  React.useEffect(() => {
    mouse_draggable();
    focus_on_click();
  }, []);

  React.useEffect(() => {
    load_doc(reload);
  }, [reload]);

  React.useEffect(() => {
    if (zoom_page_height == id) do_zoom_page_height();
    if (zoom_page_width == id) do_zoom_page_width();
    if (sync == id) do_sync();
  }, [zoom_page_height, zoom_page_width, sync]);

  React.useEffect(() => {
    if (scroll_pdf_into_view) {
      const { page, y, id } = scroll_pdf_into_view;
      do_scroll_pdf_into_view(page, y, id);
    }
  }, [scroll_pdf_into_view]);

  React.useEffect(() => {
    if (is_current) {
      // ensure any codemirror (etc.) elements blur, when this pdfjs viewer is focused.
      ($ as any)(document.activeElement).blur();
      $(ReactDOM.findDOMNode(scrollRef.current)).focus();
    }
  }, [is_current]);

  function render_status(): JSX.Element {
    if (status) {
      return <Loading text="Building..." />;
    } else {
      return (
        <>
          <Icon name="play-circle" /> Build or fix
        </>
      );
    }
  }

  function render_missing(): JSX.Element {
    return (
      <div
        style={{
          fontSize: "20pt",
          color: COLORS.GRAY,
        }}
      >
        Missing PDF -- {render_status()}
      </div>
    );
  }

  function render_loading(): JSX.Element {
    return <Loading theme="medium" />;
  }

  function on_scroll(): void {
    if (!restored_scroll) return;
    const elt = $(ReactDOM.findDOMNode(scrollRef.current));
    const scroll = { top: elt.scrollTop(), left: elt.scrollLeft() };
    actions.save_editor_state(id, { scroll });
    if (scroll.top !== undefined) {
      set_scrollTop(scroll.top);
    }
  }

  async function restore_scroll(): Promise<void> {
    await _restore_scroll(0);
    set_restored_scroll(true);
  }

  async function _restore_scroll(wait?: number): Promise<void> {
    if (wait !== undefined) {
      await delay(wait);
    }
    if (!isMounted.current || !editor_state) return;
    const scroll: Map<string, number> = editor_state.get("scroll");
    if (!scroll) return;
    const elt = $(ReactDOM.findDOMNode(scrollRef.current));
    elt.scrollTop(scroll.get("top", 0));
    elt.scrollLeft(scroll.get("left", 0));
  }

  async function load_doc(reload: number): Promise<void> {
    try {
      const doc: PDFDocumentProxy = await getDocument(
        url_to_pdf(project_id, path, reload)
      );
      if (!isMounted.current) return;
      set_missing(false);
      const v: Promise<PDFPageProxy>[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        // their promises are slightly different now...
        const page = doc.getPage(n) as unknown as Promise<PDFPageProxy>;
        v.push(page);
      }
      const pages: PDFPageProxy[] = await Promise.all(v);
      if (!isMounted.current) return;
      set_doc(doc);
      set_loaded(true);
      set_pages(pages);
      set_missing(false);
    } catch (err) {
      // This is normal if the PDF is being modified *as* it is being loaded...
      console.log(`WARNING: error loading PDF -- ${err}`);
      if (
        isMounted.current &&
        err != null && // err can be null!!
        err.toString().indexOf("Missing") != -1
      ) {
        set_missing(true);
        await delay(3000);
        if (isMounted.current && missing && actions.update_pdf != null) {
          // try again, since there is functionality for updating the pdf
          actions.update_pdf(new Date().valueOf(), true);
        }
      }
      // actions.set_error();
    }
  }

  async function do_scroll_pdf_into_view(
    page: number,
    y: number,
    id2: string
  ): Promise<void> {
    if (id != id2) {
      // not set to *this* viewer, so ignore.
      return;
    }
    const is_ready = () => {
      return doc != null && doc.getPage != null;
    };
    let i = 0;
    while (i < 50 && !is_ready()) {
      // doc can be defined but not doc.getPage.
      // can't scroll document into position if we haven't even loaded it yet.  Just do nothing in this case.
      await delay(100);
      if (!isMounted.current) return;
      i += 1;
    }
    if (!is_ready()) {
      // give up.
      return;
    }
    if (doc == null) return;

    /*
    We iterative through each page in the document, determine its height, and add that
    to a running total, along with the gap between pages.  Once we get to the given page,
    we then just add y.  We then scroll the containing div down to that position.
    */
    // Get all pages before page we are scrolling to in parallel.
    const page_promises: Promise<PDFPageProxy>[] = [];
    for (let n = 1; n <= page; n++) {
      // their promises are slightly different now...
      const page = doc.getPage(n) as unknown as Promise<PDFPageProxy>;
      page_promises.push(page);
    }

    let pages;
    try {
      pages = await Promise.all(page_promises);
    } catch (err) {
      actions.set_error(`error scrolling PDF into position -- ${err}`);
    }

    await delay(0);
    if (!isMounted.current) return;

    const scale = get_scale();

    // This EXTRA_GAP is something I observed, and I can't seem to get rid of
    // except by a bunch of explicit style and displaying inline-block for pages,
    // and that causes other problems.  It works, at least on Chrome v78, and in
    // the worst case of not working, it would just mean that the result isn't
    // visually centered perfectly.
    const EXTRA_GAP = 5.5;

    let s: number = PAGE_GAP + y * scale;
    for (const page of pages.slice(0, pages.length - 1)) {
      s += scale * page.view[3] + PAGE_GAP + EXTRA_GAP;
    }
    const elt = $(ReactDOM.findDOMNode(scrollRef.current));
    const height = elt.height();
    if (!height) return;
    s -= height / 2; // center it in the viewport.
    elt.scrollTop(s);
    i = 0;
    do {
      i += 1;
      await delay(100);
      if (!isMounted.current) return;
      elt.scrollTop(s);
    } while (i < 50 && Math.abs((elt.scrollTop() as number) - s) > 10);
    // Wait a little before clearing the scroll_pdf_into_view field,
    // so the yellow highlight bar gets rendered as the page is rendered.
    await delay(100);
    actions.setState({ scroll_pdf_into_view: undefined });
  }

  function mouse_draggable(): void {
    $(ReactDOM.findDOMNode(scrollRef.current)).mouse_draggable();
  }

  async function scroll_click(evt, scroll): Promise<void> {
    /* This first delay is needed since otherwise react complains

        backend.js:6 Warning: unstable_flushDiscreteUpdates: Cannot flush updates when React is already rendering.

    whenever you click on the pdf to focus it.
    */
    await delay(0);

    scroll.focus();
    if (is_current) {
      return;
    }
    evt.stopPropagation(); // stop propagation to focus doesn't land on *individual page*
    actions.set_active_id(id); // fix side effect of stopping propagation.
    // wait an do another focus -- critical or keyboard navigation is flakie.
    await delay(0);
    scroll.focus();
  }

  function focus_on_click(): void {
    const scroll = $(ReactDOM.findDOMNode(scrollRef.current));
    scroll.on("click", (evt) => scroll_click(evt, scroll));
  }

  async function do_zoom_page_width(): Promise<void> {
    actions.setState({ zoom_page_width: undefined }); // we got the message.
    if (doc == null) return;
    let page;
    try {
      page = await doc.getPage(1);
      if (!isMounted.current) return;
    } catch (err) {
      return; // Can't load, maybe there is no page 1, etc...
    }
    const width = $(ReactDOM.findDOMNode(scrollRef.current)).width();
    if (width === undefined) return;
    const scale = (width - 10) / page.view[2];
    actions.set_font_size(id, get_font_size(scale));
  }

  async function do_zoom_page_height(): Promise<void> {
    actions.setState({ zoom_page_height: undefined });
    let page;
    if (doc == null) return;
    try {
      page = await doc.getPage(1);
      if (!isMounted.current) return;
    } catch (err) {
      return;
    }
    const height = $(ReactDOM.findDOMNode(scrollRef.current)).height();
    if (height === undefined) return;
    const scale = (height - 10) / page.view[3];
    actions.set_font_size(id, get_font_size(scale));
  }

  function do_sync(): void {
    actions.setState({ sync: undefined });
    const e = $(ReactDOM.findDOMNode(scrollRef.current));
    const offset = e.offset();
    const height = e.height();
    if (!offset || !height) return;
    dblclick(offset.left, offset.top + height / 2);
  }

  function sync_highlight({ n, id }): SyncHighlight | undefined {
    if (
      scroll_pdf_into_view != null &&
      scroll_pdf_into_view.page === n &&
      scroll_pdf_into_view.id === id
    ) {
      return {
        y: scroll_pdf_into_view.y,
        until: seconds_ago(-HIGHLIGHT_TIME_S),
      };
    }
  }

  function render_pages(): JSX.Element[] {
    if (pages == null || pages.length == 0) return [];
    const ret: JSX.Element[] = [];
    let top: number = 0;
    const scale = get_scale();
    if (doc == null) return [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = pages[n - 1];
      if (page == null) continue;
      const page_renderer =
        top >= scrollTop - WINDOW_SIZE * scale &&
        top <= scrollTop + WINDOW_SIZE * scale
          ? renderer
          : "none";
      ret.push(
        <Page
          id={id}
          actions={actions}
          doc={doc}
          page={page}
          n={n}
          key={n}
          renderer={page_renderer}
          scale={scale}
          sync_highlight={sync_highlight({ n, id })}
        />
      );
      top += scale * page.view[3] + PAGE_GAP;
    }
    if (!restored_scroll) {
      // Restore the scroll position after the pages get
      // rendered into the DOM.
      restore_scroll();
    }
    return ret;
  }

  function render_content(): JSX.Element | JSX.Element[] {
    if (!loaded) {
      if (missing) {
        return render_missing();
      } else {
        return render_loading();
      }
    } else {
      return (
        <div
          style={{
            visibility: restored_scroll ? "visible" : "hidden",
          }}
        >
          {render_pages()}
        </div>
      );
    }
  }

  // TODO use account's font size ?!
  function get_scale(): number {
    return font_size / 12;
  }

  function get_font_size(scale: number): number {
    return 12 * scale;
  }

  function render_other_viewers() {
    if (derived_file_types.size == 0) return;
    return (
      <>
        Instead, you might want to switch to the{" "}
        {list_alternatives(derived_file_types)} view by selecting it via the
        dropdown selector above.
      </>
    );
  }

  function render_custom_error_message() {
    if (custom_pdf_error_message == null) return;
    return (
      <Alert
        message={<Markdown value={custom_pdf_error_message} />}
        type="info"
      />
    );
  }

  function render_no_pdf(): JSX.Element {
    return (
      <div
        style={{
          backgroundColor: "white",
          margin: "15px",
          overflowY: "auto",
        }}
      >
        There is no rendered PDF file available. {render_other_viewers()}
        <hr />
        {render_custom_error_message()}
      </div>
    );
  }

  if (mode == "rmd" && derived_file_types != undefined) {
    if (!derived_file_types.contains("pdf")) {
      return render_no_pdf();
    }
  }

  return (
    <div
      style={{
        overflow: "auto",
        width: "100%",
        cursor: "default",
        textAlign: "center",
        backgroundColor: !loaded ? "white" : undefined,
      }}
      onScroll={throttle(() => on_scroll(), 150)}
      ref={scrollRef}
      tabIndex={
        1 /* Need so keyboard navigation works; also see mouse-draggable click event. */
      }
    >
      <div>{render_content()}</div>
    </div>
  );
});

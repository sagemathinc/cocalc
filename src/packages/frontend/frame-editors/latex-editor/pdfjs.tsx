/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is a renderer using pdf.js.

const HIGHLIGHT_TIME_S: number = 6;

import "./pdfjs-worker";

import { useCallback, useRef, useState } from "react";
import { Icon, Loading, Markdown } from "@cocalc/frontend/components";
import { Alert } from "antd";
import { delay } from "awaiting";
import { Set } from "immutable";
import $ from "jquery";
import { seconds_ago, list_alternatives } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { dblclick } from "./mouse-click";
import { useEffect } from "react";
import {
  redux,
  useActions,
  useRedux,
  useIsMountedRef,
} from "@cocalc/frontend/app-framework";
import { getDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { BG_COL, Page, PAGE_GAP } from "./pdfjs-page";
import { SyncHighlight } from "./pdfjs-annotation";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/webpack";
import { EditorState } from "../frame-tree/types";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";

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
  is_current: boolean;
  is_visible: boolean;
  status: string;
}

export function PDFJS({
  id,
  name,
  actions,
  editor_state,
  project_id,
  path,
  reload,
  font_size,
  is_current,
  is_visible,
  status,
}: PDFJSProps) {
  const { desc } = useFrameContext();
  const isMounted = useIsMountedRef();
  const pageActions = useActions("page");

  const zoom_page_width = useRedux(name, "zoom_page_width");
  const zoom_page_height = useRedux(name, "zoom_page_height");
  const sync = useRedux(name, "sync");
  const scroll_pdf_into_view = useRedux(name, "scroll_pdf_into_view")?.toJS();
  const mode: undefined | "rmd" = useRedux(name, "mode");
  const derived_file_types: Set<string> = useRedux(name, "derived_file_types");
  const custom_pdf_error_message = useRedux(name, "custom_pdf_error_message");

  const [loaded, set_loaded] = useState<boolean>(false);
  const [pages, set_pages] = useState<PDFPageProxy[]>([]);
  const [missing, set_missing] = useState<boolean>(false);
  const [doc, set_doc] = useState<PDFDocumentProxy | null>(null);

  const divRef = useRef<HTMLDivElement>(null);
  usePinchToZoom({ target: divRef });

  useEffect(() => {
    mouse_draggable();
    focus_on_click();
  }, []);

  useEffect(() => {
    load_doc(reload);
  }, [reload]);

  useEffect(() => {
    if (zoom_page_height == id) do_zoom_page_height();
    if (zoom_page_width == id) do_zoom_page_width();
    if (sync == id) do_sync();
  }, [zoom_page_height, zoom_page_width, sync]);

  useEffect(() => {
    if (scroll_pdf_into_view) {
      const { page, y, id } = scroll_pdf_into_view;
      do_scroll_pdf_into_view(page, y, id);
    }
  }, [scroll_pdf_into_view]);

  const keyHandler = useCallback((evt) => {
    // console.log("keyHandler", evt);
    // TODO: this same sort navigation *should* be used elsewhere, e.g.
    // in jupyter/cell-list.tsx.  We should refactor it out into a hook somehow.
    // Also, it's done even more badly in jupyter/cell-list.tsx.
    if ((evt.key == " " && !evt.shiftKey) || evt.key == "PageDown") {
      // space = move a visible page down
      virtuosoRef.current?.scrollBy({
        top: divRef.current?.getBoundingClientRect()?.height ?? 200,
      });
      return;
    }
    if ((evt.key == " " && evt.shiftKey) || evt.key == "PageUp") {
      // left = move a visible page up
      virtuosoRef.current?.scrollBy({
        top: -(divRef.current?.getBoundingClientRect()?.height ?? 200),
      });
      return;
    }
    if (evt.key == "ArrowRight") {
      // next page
      virtuosoRef.current?.scrollBy({
        top:
          curPageHeightRef.current ??
          divRef.current?.getBoundingClientRect()?.height ??
          200,
      });
      return;
    }
    if (evt.key == "ArrowLeft") {
      // previous page
      virtuosoRef.current?.scrollBy({
        top: -(
          curPageHeightRef.current ??
          divRef.current?.getBoundingClientRect()?.height ??
          200
        ),
      });
      return;
    }

    if (evt.key == "ArrowDown") {
      if (evt.ctrlKey || evt.metaKey) {
        // end of document
        virtuosoRef.current?.scrollTo({ top: 9999999999999999 });
      } else {
        virtuosoRef.current?.scrollBy({
          top: (divRef.current?.getBoundingClientRect()?.height ?? 300) / 20,
        });
      }
      return;
    }
    if (evt.key == "ArrowUp") {
      if (evt.ctrlKey || evt.metaKey) {
        // begining of document
        virtuosoRef.current?.scrollTo({ top: 0 });
      } else {
        virtuosoRef.current?.scrollBy({
          top: -(divRef.current?.getBoundingClientRect()?.height ?? 300) / 20,
        });
      }
      return;
    }
    if (evt.key == "Home") {
      // beginning
      virtuosoRef.current?.scrollTo({ top: 0 });
      return;
    }
    if (evt.key == "End") {
      // end
      virtuosoRef.current?.scrollTo({ top: 9999999999999999 });
      return;
    }
    if (evt.key == "-" || (evt.key == "," && evt.ctrlKey && evt.shiftKey)) {
      actions.decrease_font_size(id);
      return;
    }
    if (evt.key == "=" || (evt.key == "." && evt.ctrlKey && evt.shiftKey)) {
      actions.increase_font_size(id);
      return;
    }
    if (evt.key == "0" && (evt.metaKey || evt.ctrlKey)) {
      actions.set_font_size(
        id,
        redux.getStore("account").get("font_size") ?? 14
      );
      return;
    }
  }, []);

  useEffect(() => {
    if (actions == null || pageActions == null || divRef.current == null)
      return;
    if (is_current && is_visible) {
      // ensure any codemirror (etc.) elements blur, when
      // this pdfjs viewer is focused, so keyboard actions don't
      // also go to that editor.
      ($ as any)(document.activeElement).blur();
      $(divRef.current).focus();
      pageActions.set_active_key_handler(keyHandler, project_id, actions.path);
    } else {
      pageActions.erase_active_key_handler(keyHandler);
    }
  }, [is_current, is_visible, pageActions != null]);

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

      // documents often don't have pageLabels, but when they do, they are
      // good to show (e.g., in a book the content at the beginning might
      // be in roman numerals).
      const pages0 = await doc.getPageLabels();
      actions.setPages(id, pages0 ?? doc.numPages);
      actions.setPage(id, desc.get("page") ?? (pages0 == null ? 1 : "1"));
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
    if (divRef.current == null) return;
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
    const height = divRef.current?.getBoundingClientRect()?.height;
    if (!height) return;

    virtuosoRef.current?.scrollToIndex({
      index: page - 1,
      offset: y * getScale() + PAGE_GAP - height / 2,
    });

    // Wait a little before clearing the scroll_pdf_into_view field,
    // so the yellow highlight bar gets rendered as the page is rendered.
    await delay(100);
    actions.setState({ scroll_pdf_into_view: undefined });
  }

  function mouse_draggable(): void {
    if (divRef.current == null) return;
    $(divRef.current).mouse_draggable();
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
    if (divRef.current == null) return;
    const scroll = $(divRef.current);
    scroll.on("click", (evt) => scroll_click(evt, scroll));
  }

  async function do_zoom_page_width(): Promise<void> {
    if (divRef.current == null) return;
    actions.setState({ zoom_page_width: undefined }); // we got the message.
    if (doc == null) return;
    let page;
    try {
      page = await doc.getPage(1);
      if (!isMounted.current) return;
    } catch (err) {
      return; // Can't load, maybe there is no page 1, etc...
    }
    const width = $(divRef.current).width();
    if (width === undefined) return;
    const scale = (width - 10) / page.view[2];
    actions.set_font_size(id, get_font_size(scale));
  }

  async function do_zoom_page_height(): Promise<void> {
    if (divRef.current == null) return;
    actions.setState({ zoom_page_height: undefined });
    let page;
    if (doc == null) return;
    try {
      page = await doc.getPage(1);
      if (!isMounted.current) return;
    } catch (err) {
      return;
    }
    const height = $(divRef.current).height();
    if (height === undefined) return;
    const scale = (height - 10) / page.view[3];
    actions.set_font_size(id, get_font_size(scale));
  }

  function do_sync(): void {
    if (divRef.current == null) return;
    actions.setState({ sync: undefined });
    const e = $(divRef.current);
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

  const [curPageIndex, setCurPageIndex] = useState<number | string>(
    desc.get("page")
  );
  // This can be handy:
  const curPageHeightRef = useRef<number | undefined>(undefined);
  const updateCurrentPage = useCallback(
    ({ index, offset }) => {
      // We *define* the current page to be whatever page intersects
      // the exact middle of divRef.  This might not be perfect, but
      // at least it is a definition.
      // We figure this out since we know the page heights
      // and the padding between pages.
      const scale = getScale();
      const divHeight = divRef.current?.getBoundingClientRect()?.height;
      if (divHeight == null) return;
      const middle = divHeight / 2;
      let topOfPage = -offset;
      const heightOfPage = pages[index]?.getViewport({ scale })?.height;
      if (heightOfPage == null) return;
      let bottomOfPage = topOfPage + heightOfPage + PAGE_GAP;
      curPageHeightRef.current = heightOfPage + PAGE_GAP;
      while (
        index + 1 < pages.length &&
        !(topOfPage <= middle && bottomOfPage >= middle)
      ) {
        index += 1;
        topOfPage = bottomOfPage;
        const heightOfPage = pages[index]?.getViewport({ scale })?.height;
        if (heightOfPage == null) return;
        bottomOfPage = topOfPage + heightOfPage + PAGE_GAP;
        // so when done this is correct:
        curPageHeightRef.current = heightOfPage + PAGE_GAP;
      }
      setCurPageIndex(index);
      actions.setPage(id, index + 1);
    },
    [id, pages, font_size]
  );

  const getPageIndex = useCallback(() => {
    const page = desc.get("page");
    if (page == null) return;
    let index;
    if (typeof page == "string") {
      // a little complicated in case of string page labels
      index = desc.get("pages")?.indexOf(page);
      if (index == -1 || index == null) return;
    } else {
      index = page - 1;
    }
    return index;
  }, [desc.get("page"), desc.get("pages")]);

  useEffect(() => {
    const index = getPageIndex();
    if (index == null || curPageIndex == index) return;
    virtuosoRef.current?.scrollToIndex({ index, align: "center" });
  }, [desc.get("page")]);

  useEffect(() => {
    const index = getPageIndex();
    if (index == null) return;
    virtuosoRef.current?.scrollToIndex({ index, align: "center" });
  }, [font_size]);

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: name + id,
    onScroll: (scrollState) => {
      actions.save_editor_state(id, { scrollState });
      updateCurrentPage(scrollState);
    },
    initialState: editor_state.get("scrollState")?.toJS(),
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  function renderPagesUsingVirtuoso() {
    if (pages == null || pages.length == 0) return [];
    const scale = getScale();
    const viewport = pages[0]?.getViewport({ scale });
    const height = (viewport?.height ?? 500) + PAGE_GAP;
    return (
      <Virtuoso
        increaseViewportBy={4000}
        ref={virtuosoRef}
        defaultItemHeight={height}
        totalCount={doc.numPages}
        itemContent={(index) => {
          const page = pages[index];
          if (page == null) {
            // should not happen
            return <div style={{ height: "1px" }}></div>;
          }
          const n = index + 1;
          return (
            <Page
              id={id}
              actions={actions}
              doc={doc}
              page={page}
              n={n}
              key={n}
              scale={scale}
              sync_highlight={sync_highlight({ n, id })}
            />
          );
        }}
        {...virtuosoScroll}
      />
    );
  }

  function render_content(): JSX.Element | JSX.Element[] {
    if (!loaded) {
      if (missing) {
        return render_missing();
      } else {
        return render_loading();
      }
    } else {
      return <div className="smc-vfill">{renderPagesUsingVirtuoso()}</div>;
    }
  }

  const getScale = useCallback(() => {
    return font_size / (redux.getStore("account").get("font_size") ?? 14);
  }, [font_size]);

  function get_font_size(scale: number): number {
    return (redux.getStore("account").get("font_size") ?? 14) * scale;
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
      className="smc-vfill"
      style={{
        overflow: "auto",
        width: "100%",
        cursor: "default",
        textAlign: "center",
        backgroundColor: !loaded ? "white" : BG_COL,
      }}
      ref={divRef}
      tabIndex={
        1 /* Need so keyboard navigation works; also see mouse-draggable click event. */
      }
    >
      {render_content()}
    </div>
  );
}

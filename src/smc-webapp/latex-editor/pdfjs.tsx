/*
This is a renderer using pdf.js.
*/

import { Map } from "immutable";

import { throttle } from "underscore";

import * as $ from "jquery";

import { is_different } from "./misc";
import { dblclick } from "./mouse-click";

import { Component, React, ReactDOM, rclass, rtypes, Rendered } from "./react";
const { Loading } = require("../r_misc");
import { getDocument } from "./pdfjs-doc-cache.ts";
import { raw_url } from "./util";
import { Page, PAGE_GAP } from "./pdfjs-page.tsx";

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

    // reduxProps
    zoom_page_width?: string;
    zoom_page_height?: string;
    sync?: string;
    scroll_into_view?: { page: number; y: number; id: string };
}

interface PDFJSState {
    loaded: boolean;
    doc: PDFDocumentProxy;
}

class PDFJS extends Component<PDFJSProps, PDFJSState> {
    private mounted: boolean;

    constructor(props) {
        super(props);

        this.state = {
            loaded: false,
            doc: { pdfInfo: { fingerprint: "" } }
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
                    "scroll_into_view"
                ]
            ) ||
            this.state.loaded != next_state.loaded ||
            this.state.doc.pdfInfo.fingerprint !=
                next_state.doc.pdfInfo.fingerprint
        );
    }

    render_loading(): Rendered {
        return <Loading theme="medium" />;
    }

    on_scroll(): void {
        let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
        const scroll = { top: elt.scrollTop(), left: elt.scrollLeft() };
        this.props.actions.save_editor_state(this.props.id, { scroll });
    }

    restore_scroll(): void {
        if (!this.props.editor_state || !this.mounted) return;
        const scroll: Map<string, number> = this.props.editor_state.get(
            "scroll"
        );
        if (!scroll) return;
        let elt = $(ReactDOM.findDOMNode(this.refs.scroll));
        elt.scrollTop(scroll.get("top"));
        elt.scrollLeft(scroll.get("left"));
    }

    async load_doc(reload): Promise<void> {
        const url_to_pdf =
            raw_url(this.props.project_id, this.props.path) +
            "?param=" +
            reload;
        try {
            const doc: PDFDocumentProxy = await getDocument(url_to_pdf);
            if (!this.mounted) return;
            this.setState({ doc: doc, loaded: true });
        } catch (err) {
            this.props.actions.set_error(`error loading PDF -- ${err}`);
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
        if (this.props.reload != next_props.reload)
            this.load_doc(next_props.reload);
        if (
            next_props.scroll_into_view &&
            this.props.scroll_into_view !== next_props.scroll_into_view
        ) {
            let { page, y, id} = next_props.scroll_into_view;
            this.scroll_into_view(page, y, id);
        }
    }

    componentWillUnmount(): void {
        this.mounted = false;
    }

    mouse_draggable(): void {
        $(ReactDOM.findDOMNode(this.refs.scroll)).mouse_draggable();
    }

    focus_on_click(): void {
        // Whenever pdf is clicked on, in the *next* render loop, we
        // defocus the codemirrors by calling this blur below.
        // This makes it so space-key, arrows, etc. properly scroll.
        function blur_codemirror(): void {
            setTimeout(function(): void {
                $(document.activeElement).blur();
            }, 0);
        }
        $(ReactDOM.findDOMNode(this.refs.scroll)).on("click", blur_codemirror);
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
        // TODO -- quick hack for now.
        let t: number;
        for (t of [250, 500, 100]) {
            setTimeout(() => this.restore_scroll(), t);
        }
    }

    render_pages(): Rendered[] {
        const pages: Rendered[] = [];
        const scale = this.scale();
        for (let n = 1; n <= this.state.doc.numPages; n++) {
            pages.push(
                <Page
                    id={this.props.id}
                    actions={this.props.actions}
                    doc={this.state.doc}
                    n={n}
                    key={n}
                    renderer={this.props.renderer}
                    scale={scale}
                />
            );
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
                    textAlign: "center"
                }}
                onScroll={throttle(() => this.on_scroll(), 250)}
                ref={"scroll"}
            >
                <div>{this.render_content()}</div>
            </div>
        );
    }
}

const PDFJS0 = rclass(PDFJS);
export { PDFJS0 as PDFJS };

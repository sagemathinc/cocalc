/*
This is a renderer using pdf.js.
*/

import { Map } from "immutable";

import { throttle } from "underscore";

import * as $ from "jquery";

import { is_different } from "./misc";
import { Component, React, ReactDOM, rtypes, Rendered } from "./react";
const { Loading } = require("../r_misc");
import { getDocument } from "./pdfjs-doc-cache.ts";
import { raw_url } from "./util";
import { Page } from "./pdfjs-page.tsx";

import { PDFDocumentProxy } from "pdfjs-dist/webpack";

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
}

interface PDFJSState {
    loaded: boolean;
    doc: PDFDocumentProxy;
}

export class PDFJS extends Component<PDFJSProps, PDFJSState> {
    private mounted: boolean;

    constructor(props) {
        super(props);

        this.state = {
            loaded: false,
            doc: { pdfInfo: { fingerprint: "" } }
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
                ["reload", "font_size", "renderer", "path"]
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

    componentWillReceiveProps(next_props: PDFJSProps): void {
        if (this.props.reload != next_props.reload)
            this.load_doc(next_props.reload);
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
        for (let n = 1; n <= this.state.doc.numPages; n++) {
            pages.push(
                <Page
                    actions={this.props.actions}
                    doc={this.state.doc}
                    n={n}
                    key={n}
                    renderer={this.props.renderer}
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

    render() {
        return (
            <div
                style={{
                    overflow: "scroll",
                    width: "100%",
                    zoom: this.props.font_size / 12
                }}
                onScroll={throttle(() => this.on_scroll(), 250)}
                ref={"scroll"}
            >
                {this.render_content()}
            </div>
        );
    }
}

/*
Manages rendering a single page using either SVG or Canvas
*/

import { React, Rendered, Component } from "./react";

const { Loading } = require("../r_misc");
import { is_different } from "./misc";

import { SVGPage } from "./pdfjs-svg-page.tsx";
import { CanvasPage } from "./pdfjs-canvas-page.tsx";

import {
    PDFAnnotationData,
    PDFPageProxy,
    PDFDocumentProxy
} from "pdfjs-dist/webpack";

export const PAGE_GAP: number = 20;

interface PageProps {
    actions: any;
    id: string;
    n: number;
    doc: PDFDocumentProxy;
    renderer: string;
    scale: number;
}

interface PageState {
    page: PDFPageProxy;
}

export class Page extends Component<PageProps, PageState> {
    private mounted: boolean;
    constructor(props) {
        super(props);
        this.state = { page: { version: 0 } };
    }

    shouldComponentUpdate(
        next_props: PageProps,
        next_state: PageState
    ): boolean {
        return (
            is_different(this.props, next_props, ["n", "renderer", "scale"]) ||
            this.props.doc.pdfInfo.fingerprint !=
                next_props.doc.pdfInfo.fingerprint ||
            this.state.page.version != next_state.page.version
        );
    }

    async load_page(doc: PDFDocumentProxy): Promise<void> {
        try {
            let page = await doc.getPage(this.props.n);
            page.version = this.state.page.version + 1;
            if (!this.mounted) return;
            this.setState({ page });
        } catch (err) {
            this.props.actions.set_error(
                `Error getting ${this.props.n}th page: ${err}`
            );
        }
    }

    componentWillReceiveProps(next_props: PageProps): void {
        if (
            this.props.doc.pdfInfo.fingerprint !=
            next_props.doc.pdfInfo.fingerprint
        )
            this.load_page(next_props.doc);
    }

    componentWillUnmount(): void {
        this.mounted = false;
    }

    componentDidMount(): void {
        this.mounted = true;
        this.load_page(this.props.doc);
    }

    render_content(): Rendered {
        if (!this.state.page.version)
            return <Loading text={`Loading page ${this.props.n}$...`} />;
        else if (this.props.renderer == "svg") {
            return <SVGPage page={this.state.page} scale={this.props.scale} />;
        } else {
            return (
                <CanvasPage
                    page={this.state.page}
                    scale={this.props.scale}
                    click_annotation={annotation =>
                        this.click_annotation(annotation)
                    }
                />
            );
        }
    }

    render_page_number(): Rendered {
        return (
            <div
                style={{
                    textAlign: "center",
                    color: "white",
                    height: `${PAGE_GAP}px`
                }}
            >
                Page {this.props.n}
            </div>
        );
    }

    click(event): void {
        let x: number = event.nativeEvent.offsetX / this.props.scale;
        let y: number = event.nativeEvent.offsetY / this.props.scale;
        this.props.actions.synctex_pdf_to_tex(this.props.n, x, y);
    }

    async click_annotation(annotation: PDFAnnotationData): Promise<void> {
        if (annotation.url) {
            // Link to an external URL.
            // TODO: make it work for cocalc URL's, e.g., cocalc.com...
            let win = window.open(annotation.url, "_blank");
            if (win) {
                win.focus();
            }
            return;
        }
        if (annotation.dest) {
            // Internal link within the document.
            if (!this.state.page) return;
            let dest = await this.props.doc.getDestination(annotation.dest);
            let page: number = (await this.props.doc.getPageIndex(dest[0])) + 1;
            let page_height = this.state.page.pageInfo.view[3];
            this.props.actions.scroll_into_view(
                page,
                page_height - dest[3],
                this.props.id
            );
            return;
        }
        console.warn("Uknown annotation link", annotation);
    }

    render() {
        return (
            <div>
                {this.render_page_number()}
                <div
                    style={{ background: "#525659" }}
                    onDoubleClick={e => this.click(e)}
                >
                    {this.render_content()}
                </div>
            </div>
        );
    }
}

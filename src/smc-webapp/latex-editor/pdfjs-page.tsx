/*
Manages rendering a single page using either SVG or Canvas
*/

import { React, Component } from "./react";

const { Loading } = require("../r_misc");
import { is_different } from "./misc";

import { SVGPage } from "./pdfjs-svg-page.tsx";
import { CanvasPage } from "./pdfjs-canvas-page.tsx";

import { PDFPageProxy, PDFDocumentProxy } from "pdfjs-dist/webpack";

interface PageProps {
    actions: any;
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

    render_content() {
        if (!this.state.page.version)
            return <Loading text={`Loading page ${this.props.n}$...`} />;
        else if (this.props.renderer == "svg") {
            return <SVGPage page={this.state.page} scale={this.props.scale} />;
        } else {
            return (
                <CanvasPage page={this.state.page} scale={this.props.scale} />
            );
        }
    }

    click(event): void {
        let x: number = event.nativeEvent.offsetX / this.props.scale; // / width;
        let y: number = event.nativeEvent.offsetY / this.props.scale; // / height;
        this.props.actions.synctex_pdf_to_tex(this.props.n, x, y);
    }

    render() {
        return (
            <div
                style={{ background: "#525659", paddingTop: "10px" }}
                onDoubleClick={e => this.click(e)}
            >
                {this.render_content()}
            </div>
        );
    }
}

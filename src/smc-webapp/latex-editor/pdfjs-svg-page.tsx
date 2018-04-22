/* Render a single PDF page using SVG */

import * as $ from "jquery";

import { Component, React, ReactDOM } from "./react";
import { SVGGraphics, PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";
import { is_different } from "./misc";

interface Props {
    page: PDFPageProxy;
    scale: number;
}

export class SVGPage extends Component<Props, {}> {
    private mounted: boolean;

    shouldComponentUpdate(next_props: Props) {
        return is_different(this.props, next_props, ['version', 'scale']);
    }

    async render_page(page: PDFPageProxy): Promise<void> {
        const div: HTMLElement = ReactDOM.findDOMNode(this);
        const viewport: PDFPageViewport = page.getViewport(this.props.scale);
        div.style.width = viewport.width + "px";
        div.style.height = viewport.height + "px";

        try {
            const opList = await page.getOperatorList();
            if (!this.mounted) return;
            const svgGfx = new SVGGraphics(page.commonObjs, page.objs);
            const svg = await svgGfx.getSVG(opList, viewport);
            if (!this.mounted) return;
            $(div).empty();
            div.appendChild(svg);
        } catch (err) {
            console.error(`pdf.js -- Error rendering svg page: ${err}`);
        }
    }

    componentWillReceiveProps(next_props: Props): void {
        this.render_page(next_props.page);
    }

    componentWillUnmount(): void {
        this.mounted = false;
    }

    componentDidMount(): void {
        this.mounted = true;
        this.render_page(this.props.page);
    }

    render() {
        return (
            <div
                style={{
                    margin: "auto",
                    background: "white"
                }}
            />
        );
    }
}

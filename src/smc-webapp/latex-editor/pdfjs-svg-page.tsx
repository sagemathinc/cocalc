/* Render a single PDF page using SVG */

import * as $ from "jquery";

import { Component, React, ReactDOM, rtypes } from "./react";
const { Loading } = require("../r_misc");
import { SVGGraphics, PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";

interface Props {
    page: PDFPageProxy;
}

export class SVGPage extends Component<Props, {}> {
    private mounted: boolean;

    shouldComponentUpdate(next_props: Props) {
        return this.props.page.version != next_props.page.version;
    }

    async render_page(page: PDFPageProxy): Promise<void> {
        const div: HTMLElement = ReactDOM.findDOMNode(this);
        const viewport: PDFPageViewport = page.getViewport(1);
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

    componentWillReceiveProps(next_props : Props) : void {
        if (this.props.page.version != next_props.page.version)
            this.render_page(next_props.page);
    }

    componentWillUnmount() : void {
        this.mounted = false;
    }

    componentDidMount() : void {
        this.mounted = true;
        this.render_page(this.props.page);
    }

    render() {
        return <div style={{ margin: "auto", background: "white" }} />;
    }
}

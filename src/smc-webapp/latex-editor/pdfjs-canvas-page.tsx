/*
Render a single PDF page using canvas.
*/

import * as $ from "jquery";

import { Component, React, ReactDOM, rtypes } from "./react";
const { Loading } = require("../r_misc");
import { PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";

interface Props {
    page: PDFPageProxy;
}

export class CanvasPage extends Component<Props, {}> {
    shouldComponentUpdate(next_props: Props): boolean {
        return this.props.page.version != next_props.page.version;
    }

    async render_page(page: PDFPageProxy): Promise<void> {
        const div: HTMLElement = ReactDOM.findDOMNode(this);
        // scale = 2.0, so doesn't look like crap on retina
        const viewport: PDFPageViewport = page.getViewport(2.0);
        const canvas: HTMLCanvasElement = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        try {
            await page.render({
                canvasContext: canvas.getContext("2d"),
                viewport: viewport,
                enableWebGL: true
            });
            $(div).empty();
            div.appendChild(canvas);
        } catch (err) {
            console.error(`pdf.js -- Error rendering canvas page: ${err}`);
        }
    }

    componentWillReceiveProps(next_props : Props) : void {
        if (this.props.page.version != next_props.page.version)
            this.render_page(next_props.page);
    }

    componentDidMount() : void {
        this.render_page(this.props.page);
    }

    render() {
        return (
            <div
                style={{
                    margin: "auto",
                    background: "#525659",
                    textAlign: "center",
                    zoom: 0.5 /* so doesn't look like crap on retina */
                }}
            />
        );
    }
}

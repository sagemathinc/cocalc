/*
Render a single PDF page using canvas.
*/

import * as $ from "jquery";

import { Component, React, ReactDOM } from "./react";
import { PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";
import { is_different } from "./misc";

interface Props {
    page: PDFPageProxy;
    scale: number;
}

// See https://stackoverflow.com/questions/4720262/canvas-drawing-and-retina-display-doable
function scale_canvas(canvas: HTMLCanvasElement, ctx): void {
    if (window.devicePixelRatio > 1) {
        var canvasWidth = canvas.width;
        var canvasHeight = canvas.height;

        canvas.width = canvasWidth * window.devicePixelRatio;
        canvas.height = canvasHeight * window.devicePixelRatio;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;

        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
}

export class CanvasPage extends Component<Props, {}> {
    shouldComponentUpdate(next_props: Props): boolean {
        return is_different(this.props, next_props, ["version", "scale"]);
    }

    async render_page(page: PDFPageProxy, scale: number): Promise<void> {
        const div: HTMLElement = ReactDOM.findDOMNode(this);
        const viewport: PDFPageViewport = page.getViewport(scale);
        const canvas: HTMLCanvasElement = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        scale_canvas(canvas, ctx);
        try {
            await page.render({
                canvasContext: ctx,
                viewport: viewport,
                enableWebGL: true
            });
            $(div).empty();
            div.appendChild(canvas);
        } catch (err) {
            console.error(`pdf.js -- Error rendering canvas page: ${err}`);
        }
    }

    componentWillReceiveProps(next_props: Props): void {
        this.render_page(next_props.page, next_props.scale);
    }

    componentDidMount(): void {
        this.render_page(this.props.page, this.props.scale);
    }

    render() {
        return (
            <div
                style={{
                    margin: "auto",
                    background: "#525659",
                    textAlign: "center"
                }}
            />
        );
    }
}

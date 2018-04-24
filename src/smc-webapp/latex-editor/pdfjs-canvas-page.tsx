/*
Render a single PDF page using canvas.
*/

import * as $ from "jquery";

import { Component, React, ReactDOM, Rendered } from "./react";
import {
    PDFAnnotationData,
    PDFPageProxy,
    PDFPageViewport,
    PDFJS
} from "pdfjs-dist/webpack";
import { is_different } from "./misc";

interface Props {
    page: PDFPageProxy;
    scale: number;
}

interface State {
    annotation_layer?: Rendered;
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

export class CanvasPage extends Component<Props, State> {
    constructor(props) {
        super(props);
        this.state = { annotation_layer: undefined };
    }
    shouldComponentUpdate(next_props: Props, next_state: State): boolean {
        return (
            is_different(this.props, next_props, ["version", "scale"]) ||
            this.state.annotation_layer != next_state.annotation_layer
        );
    }

    async render_page(page: PDFPageProxy, scale: number): Promise<void> {
        const div: HTMLElement = ReactDOM.findDOMNode(this.refs.page);
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
            return;
        }
        this.render_annotation_layer(page);
    }

    click_annotation(annotation: PDFAnnotationData): void {
        console.log("clicked on ", annotation);
        if (annotation.url) {
            let win = window.open(annotation.url, "_blank");
            if (win) {
                win.focus();
            }
            return;
        }
    }

    // We render only the *LINKS*, which are all that matter regarding
    // annotations when editing a latex document.
    async render_annotation_layer(page: PDFPageProxy): Promise<void> {
        let canvas = $(ReactDOM.findDOMNode(this.refs.page)).find("canvas");
        let pos = canvas.position();
        if (pos === undefined) return;

        let annotations: PDFAnnotationData;
        try {
            annotations = await page.getAnnotations();
        } catch (err) {
            console.error(`pdf.js -- Error rendering annotations: #{err}`);
            return;
        }
        window.annotations = annotations;
        window.page_view = page.pageInfo.view;
        let scale = this.props.scale;
        console.log("scale=", scale);
        let v: Rendered[] = [];
        for (let annotation of annotations) {
            console.log("annotation =", annotation);
            if (annotation.subtype != "Link") {
                console.log("skipping");
                continue;
            }
            // if (!annotation.url) { continue; }
            let [x1, y1, x2, y2] = PDFJS.Util.normalizeRect(annotation.rect);
            console.log(x1, y1, x2, y2);

            let page_height = page.pageInfo.view[3];

            let left = x1 - 1,
                top = page_height - y2 - 1,
                width = x2 - x1 + 1,
                height = y2 - y1;

            let border = "";
            if (annotation.borderStyle.width) {
                border = `1px solid rgb(${annotation.color[0]}, ${
                    annotation.color[1]
                }, ${annotation.color[2]})`;
            }
            console.log(border, annotation.borderStyle.width);

            let elt = (
                <div
                    onClick={() => this.click_annotation(annotation)}
                    key={annotation.id}
                    style={{
                        position: "absolute",
                        left: left * scale,
                        top: top * scale,
                        width: width * scale,
                        height: height * scale,
                        border: border,
                        cursor: "pointer"
                    }}
                />
            );
            v.push(elt);
        }
        let layer = (
            <div
                style={{
                    position: "absolute",
                    left: pos.left,
                    top: 0,
                    border: "1px solid blue"
                }}
            >
                {v}
            </div>
        );
        this.setState({ annotation_layer: layer });
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
                    textAlign: "center",
                    position: "relative"
                }}
            >
                {this.state.annotation_layer}
                <div ref="page" />
            </div>
        );
    }
}

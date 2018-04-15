/*
This is a renderer using pdf.js.
*/

import { throttle } from "underscore";

import misc from "smc-util/misc";

import { React, ReactDOM, rclass, rtypes } from "../smc-react";

import { Loading } from "../r_misc";

import pdfjs from "pdfjs-dist/webpack";

/* for dev only */ window.pdfjs = pdfjs;

import util from "../code-editor/util";

export let PDFJS = rclass({
    displayName: "LaTeXEditor-PDFJS",

    propTypes: {
        id: rtypes.string.isRequired,
        actions: rtypes.object.isRequired,
        editor_state: rtypes.immutable.Map,
        is_fullscreen: rtypes.bool,
        project_id: rtypes.string,
        path: rtypes.string,
        reload: rtypes.number,
        font_size: rtypes.number.isRequired
    },

    getInitialState() {
        return {
            num_pages: undefined,
            renderer: "svg" /* "canvas" or "svg" */
        };
    }, // probably only use this, but easy to switch for now for testing.
    //render    : 'canvas'

    shouldComponentUpdate(props, state) {
        return (
            misc.is_different(this.props, props, ["reload", "font_size"]) ||
            misc.is_different(this.state, state, ["num_pages", "render"])
        );
    },

    render_loading() {
        return (
            <div>
                <Loading
                    style={{
                        fontSize: "24pt",
                        textAlign: "center",
                        marginTop: "15px",
                        color: "#888",
                        background: "white"
                    }}
                />
            </div>
        );
    },

    document_load_success(info) {
        this.setState({ num_pages: info.numPages });
    },

    show() {
        $(ReactDOM.findDOMNode(this.refs.scroll)).css("opacity", 1);
    },

    on_item_click(info) {
        console.log("on_item_click", info);
    },

    on_scroll() {
        let elt = ReactDOM.findDOMNode(this.refs.scroll);
        if (elt == null) {
            return;
        }
        elt = $(elt);
        const scroll = { top: elt.scrollTop(), left: elt.scrollLeft() };
        this.props.actions.save_editor_state(this.props.id, { scroll });
    },

    restore_scroll() {
        if (!this.props.editor_state) return;
        const scroll = this.props.editor_state.get("scroll");
        if (!scroll) return;
        let elt = ReactDOM.findDOMNode(this.refs.scroll);
        if (!elt) return;
        elt = $(elt);
        elt.scrollTop(scroll.get("top"));
        elt.scrollLeft(scroll.get("left"));
        this.svg_hack();
    },

    load_page_canvas(page, n) {
        const viewport = page.getViewport(2.0);
        const canvas_div = ReactDOM.findDOMNode(this.refs.page_div);
        const canvas = $("<canvas/>")[0]; /* todo */
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: viewport
        });
        canvas_div.appendChild(canvas);
    },

    async load_page_svg(page, n) {
        const svg_div = ReactDOM.findDOMNode(this.refs.page_div);
        let viewport = page.getViewport(1);
        svg_div.style.width = viewport.width + "px";
        svg_div.style.height = viewport.height + "px";

        try {
            const opList = await page.getOperatorList();
            const svgGfx = new pdfjs.SVGGraphics(page.commonObjs, page.objs);
            const svg = await svgGfx.getSVG(opList, viewport);
            svg_div.appendChild(svg);
        } catch (err) {
            console.error(`Error getting ${n}th svg page: ${err}`);
        }
    },

    async load_page(doc, n) {
        let page;
        try {
            page = await doc.getPage(n);
            if (this.state.renderer == "svg") {
                await this.load_page_svg(page, n);
            } else {
                this.load_page_canvas(page, n);
            }
        } catch (err) {
            console.error(`Error getting ${n}th page: ${err}`);
            return;
        }
    },

    async load_doc() {
        const file =
            util.raw_url(this.props.project_id, this.props.path) +
            "?param=" +
            this.props.reload;
        try {
            const doc = await pdfjs.getDocument(file);
            for (let n = 1; n <= doc.numPages; n++) {
                await this.load_page(doc, n);
            }
        } catch (err) {
            console.error(`load_doc Error: ${err}`);
            return;
        }
    },

    componentDidMount() {
        this.load_doc();
    },

    render() {
        return (
            <div
                style={{
                    overflow: "scroll",
                    margin: "auto",
                    width: "100%",
                    zoom: 0.5 * (this.props.font_size / 12)
                }}
                onScroll={throttle(this.on_scroll, 250)}
                ref={"scroll"}
            >
                <div
                    ref={"page_div"}
                    style={{ background: "white", margin: "auto" }}
                />
            </div>
        );
    }
});

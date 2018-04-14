/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
This is a renderer using pdf.js indirectly via react-pdf.

TODO: I will surely rewrite this from scratch directly using pdf.js, since it's critical to have
multiple views of the same document, where the document only gets loaded once.  Also, it
should survive unmount and remount properly, without having to reload the doc.  This can
only be done via direct use of pdf.js.   But that will get done later.
*/

import { throttle } from "underscore";

import misc from "smc-util/misc";

import { React, ReactDOM, rclass, rtypes } from "../smc-react";

import { Loading } from "../r_misc";

import { Document, Page } from "react-pdf/dist/entry.webpack";
import "react-pdf/dist/Page/AnnotationLayer.css";

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
        font_size: rtypes.number
    },

    getInitialState() {
        return {
            num_pages: undefined,
            render: "svg"
        };
    }, // probably only use this, but easy to switch for now for testing.
    //render    : 'canvas'

    shouldComponentUpdate(props, state) {
        return (
            misc.is_different(this.props, props, ["reload", "font_size"]) ||
            misc.is_different(this.state, state, ["num_pages", "render"])
        );
    },

    svg_hack() {
        if (this.state.render !== "svg") {
            return;
        }
        const editor = $(ReactDOM.findDOMNode(this.refs.scroll));
        const v = [];
        for (let elt of editor.find(".react-pdf__Page__svg")) {
            const a = $(elt);
            const b = $(a.children()[0]);
            b.css("max-width", "");
            a.width(b.width() + "px");
        }
    },

    render_page(number, scale) {
        return (
            <Page
                key={number}
                className={"cocalc-pdfjs-page"}
                pageNumber={number}
                renderMode={this.state.render}
                renderTextLayer={false}
                renderAnnotations={true}
                scale={scale}
                onRenderSuccess={this.restore_scroll}
                onClick={e =>
                    console.log(
                        "page click",
                        e.nativeEvent.offsetX,
                        e.nativeEvent.offsetY
                    )
                }
            />
        );
    },

    render_pages() {
        if (this.state.num_pages != null) {
            setTimeout(this.show, 150);
        }
        const scale = (this.props.font_size ? this.props.font_size : 16) / 10;
        let pages = [];
        for (let n = 1; n <= this.state.num_pages; n++) {
            pages.push(this.render_page(n, scale));
        }
        return pages;
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
        return console.log("on_item_click", info);
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
        const scroll = this.props.editor_state?.get("scroll");
        if (!scroll) return;
        let elt = ReactDOM.findDOMNode(this.refs.scroll);
        if (!elt) return;
        elt = $(elt);
        elt.scrollTop(scroll.get("top"));
        elt.scrollLeft(scroll.get("left"));
        this.svg_hack();
    },

    componentDidUpdate() {
        this.svg_hack();
    },

    render() {
        const file =
            util.raw_url(this.props.project_id, this.props.path) +
            "?param=" +
            this.props.reload;

        return (
            <div
                style={{
                    overflow: "scroll",
                    margin: "auto",
                    width: "100%",
                    opacity: 0
                }}
                onScroll={throttle(this.on_scroll, 250)}
                ref={"scroll"}
            >
                <Document
                    file={file}
                    onLoadSuccess={this.document_load_success}
                    loading={this.render_loading()}
                >
                    {this.render_pages()}
                </Document>
            </div>
        );
    }
});

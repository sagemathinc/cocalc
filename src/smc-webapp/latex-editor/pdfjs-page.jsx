import { React, ReactDOM, rclass, rtypes } from "../smc-react";
import { Loading } from "../r_misc";
import { is_different } from "smc-util/misc";

require("./pdfjs-svg-page");
import { SVGPage } from "./pdfjs-svg-page";
import { CanvasPage } from "./pdfjs-canvas-page";

export let Page = rclass({
    displayName: "LaTeXEditor-PDFJS-Page",

    propTypes: {
        n: rtypes.number.isRequired,
        doc: rtypes.object.isRequired,
        doc_version: rtypes.number.isRequired,
        renderer: rtypes.string
    },

    getDefaultProps() {
        renderer: "svg"; /* "canvas" or "svg" */
    },

    getInitialState() {
        return { page_version: 0 };
    },

    shouldComponentUpdate(next_props, next_state) {
        return (
            is_different(this.props, next_props, [
                "n",
                "doc_version",
                "renderer"
            ]) || this.state.page_version != next_state.page_version
        );
    },

    async load_page() {
        let page;
        try {
            page = await this.props.doc.getPage(this.props.n);
            /* TODO: if the component has unmounted don't do this... */
            this.page = page;
            this.setState({ page_version: this.state.page_version + 1 });
        } catch (err) {
            console.error(`Error getting ${this.props.n}th page: ${err}`);
            return;
        }
    },

    componentDidMount() {
        this.load_page();
    },

    render_content() {
        if (!this.state.page_version) return <span>Page {this.props.n}</span>;
        else if (this.props.renderer == "svg") {
            return <SVGPage page={this.page} />;
        } else {
            return <CanvasPage page={this.page} />;
        }
    },

    render() {
        return (
            <div style={{ background: "#525659", paddingTop: "10px" }}>
                {this.render_content()}
            </div>
        );
    }
});

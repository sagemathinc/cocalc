import { React, ReactDOM, rclass, rtypes } from "../smc-react";
import { Loading } from "../r_misc";

require("./pdfjs-svg-page");
import { SVGPage } from "./pdfjs-svg-page";
import { CanvasPage } from "./pdfjs-canvas-page";

export let Page = rclass({
    displayName: "LaTeXEditor-PDFJS-Page",

    propTypes: {
        n: rtypes.number.isRequired,
        doc: rtypes.object.isRequired,
        renderer: rtypes.string
    },

    getDefaultProps() {
        renderer: "svg"; /* "canvas" or "svg" */
    },

    getInitialState() {
        return { page: undefined };
    },

    async load_page() {
        let page;
        try {
            page = await this.props.doc.getPage(this.props.n);
            /* TODO: if the component has unmounted don't do this... */
            this.setState({ page });
        } catch (err) {
            console.error(`Error getting ${this.props.n}th page: ${err}`);
            return;
        }
    },

    componentDidMount() {
        this.load_page();
    },

    render_content() {
        if (!this.state.page) return <span>Page {this.props.n}</span>;
        else if (this.props.renderer == "svg") {
            return <SVGPage page={this.state.page} />;
        } else {
            return <CanvasPage page={this.state.page} />;
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

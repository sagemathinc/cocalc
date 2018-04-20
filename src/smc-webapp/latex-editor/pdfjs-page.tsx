import { React, ReactDOM, rclass, rtypes } from "./react";

const { Loading } = require("../r_misc");
import { is_different } from "./misc";

require("./pdfjs-svg-page.tsx");
import { SVGPage } from "./pdfjs-svg-page.tsx";
import { CanvasPage } from "./pdfjs-canvas-page.tsx";

export let Page = rclass({
    displayName: "LaTeXEditor-PDFJS-Page",

    propTypes: {
        actions: rtypes.object.isRequired,
        n: rtypes.number.isRequired,
        doc: rtypes.object.isRequired,
        renderer: rtypes.string
    },

    getDefaultProps() {
        return {
            renderer: "svg" /* "canvas" or "svg" */
        };
    },

    getInitialState() {
        return { page: { version: 0 } };
    },

    shouldComponentUpdate(next_props, next_state) {
        return (
            is_different(this.props, next_props, ["n", "renderer"]) ||
            this.props.doc.pdfInfo.fingerprint !=
                next_props.doc.pdfInfo.fingerprint ||
            this.state.page.version != next_state.page.version
        );
    },

    async load_page(doc) {
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
    },

    componentWillReceiveProps(next_props) {
        if (
            this.props.doc.pdfInfo.fingerprint !=
            next_props.doc.pdfInfo.fingerprint
        )
            this.load_page(next_props.doc);
    },

    componentWillUnmount() {
        this.mounted = false;
    },

    componentDidMount() {
        this.mounted = true;
        this.load_page(this.props.doc);
    },

    render_content() {
        if (!this.state.page.version)
            return <span>Loading page {this.props.n}...</span>;
        else if (this.props.renderer == "svg") {
            return <SVGPage page={this.state.page} />;
        } else {
            return <CanvasPage page={this.state.page} />;
        }
    },

    click(event) {
        console.log(
            "click!",
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );
    },

    render() {
        return (
            <div
                style={{ background: "#525659", paddingTop: "10px" }}
                onClick={this.click}
            >
                {this.render_content()}
            </div>
        );
    }
});

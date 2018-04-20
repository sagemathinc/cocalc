import { React, ReactDOM, rclass, rtypes } from "./react";
const { Loading } = require("../r_misc");
import { SVGGraphics } from "pdfjs-dist/webpack";

export let SVGPage = rclass({
    displayName: "LaTeXEditor-PDFJS-SVGPage",

    propTypes: {
        page: rtypes.object.isRequired
    },

    shouldComponentUpdate(next_props) {
        return this.props.page.version != next_props.page.version;
    },

    async render_page(page) {
        const div = ReactDOM.findDOMNode(this);
        const viewport = page.getViewport(1);
        div.style.width = viewport.width + "px";
        div.style.height = viewport.height + "px";

        try {
            const opList = await page.getOperatorList();
            if (!this.mounted) return;
            const svgGfx = new SVGGraphics(page.commonObjs, page.objs);
            const svg = await svgGfx.getSVG(opList, viewport);
            if (!this.mounted) return;
            $(div).empty(); // TODO
            div.appendChild(svg);
        } catch (err) {
            console.error(`pdf.js -- Error rendering svg page: ${err}`);
        }
    },

    componentWillReceiveProps(next_props) {
        if (this.props.page.version != next_props.page.version)
            this.render_page(next_props.page);
    },

    componentWillUnmount() {
        this.mounted = false;
    },

    componentDidMount() {
        this.mounted = true;
        this.render_page(this.props.page);
    },

    render() {
        return <div style={{ margin: "auto", background: "white" }} />;
    }
});

import { React, ReactDOM, rclass, rtypes } from "../smc-react";
import { Loading } from "../r_misc";
import { SVGGraphics } from "pdfjs-dist/webpack";

export let SVGPage = rclass({
    displayName: "LaTeXEditor-PDFJS-SVGPage",

    propTypes: {
        page: rtypes.object.isRequired
    },

    shouldComponentUpdate() {
        return false;
    },

    async load_page_svg() {
        const div = ReactDOM.findDOMNode(this);
        const viewport = this.props.page.getViewport(1);
        div.style.width = viewport.width + "px";
        div.style.height = viewport.height + "px";

        try {
            const opList = await this.props.page.getOperatorList();
            const svgGfx = new SVGGraphics(
                this.props.page.commonObjs,
                this.props.page.objs
            );
            const svg = await svgGfx.getSVG(opList, viewport);
            // TODO: if component has unmounted, don't bother.
            div.appendChild(svg);
        } catch (err) {
            console.error(`Error getting svg page: ${err}`);
        }
    },

    componentDidMount() {
        this.load_page_svg();
    },

    render() {
        return <div style={{ margin: "auto", background: "white" }}></div>;
    }
});

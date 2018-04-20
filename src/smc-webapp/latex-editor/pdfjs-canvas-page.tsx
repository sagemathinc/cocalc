import { React, ReactDOM, rclass, rtypes } from "./react";
const { Loading } = require("../r_misc");

export let CanvasPage = rclass({
    displayName: "LaTeXEditor-PDFJS-CanvasPage",

    propTypes: {
        page: rtypes.object.isRequired
    },

    shouldComponentUpdate(next_props) {
        return this.props.page.version != next_props.page.version;
    },

    async render_page(page) {
        const div = ReactDOM.findDOMNode(this);
        // scale = 2.0, so doesn't look like crap on retina
        const viewport = page.getViewport(2.0);
        const canvas: HTMLCanvasElement = document.createElement('canvas');
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
    },

    componentWillReceiveProps(next_props) {
        if (this.props.page.version != next_props.page.version)
            this.render_page(next_props.page);
    },

    componentDidMount() {
        this.render_page(this.props.page);
    },

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
});

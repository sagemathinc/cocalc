import { React, ReactDOM, rclass, rtypes } from "../smc-react";
import { Loading } from "../r_misc";

export let CanvasPage = rclass({
    displayName: "LaTeXEditor-PDFJS-CanvasPage",

    propTypes: {
        page: rtypes.object.isRequired
    },

    shouldComponentUpdate() {
        return false;
    },

    load_page_canvas() {
        // scale = 2.0, so doesn't look like crap on retina
        const viewport = this.props.page.getViewport(2.0);
        const canvas = ReactDOM.findDOMNode(this.refs.canvas);
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        this.props.page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: viewport
        });
    },

    componentDidMount() {
        this.load_page_canvas();
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
            >
                <canvas ref={"canvas"} />
            </div>
        );
    }
});

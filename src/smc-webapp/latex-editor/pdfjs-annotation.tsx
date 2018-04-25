/*
Render the annotation layer on top of a page.

The page itself could be rendered with either SVG or Canvas.

NOTE: For now we only render **link** annotations, and handle internal and external links.
We do NOT render any other annotations (e.g., notes, etc.), as would be produced code
like is here:  https://tex.stackexchange.com/questions/6306/how-to-annotate-pdf-files-generated-by-pdflatex
*/

import { Component, React, Rendered } from "./react";

import { PDFAnnotationData, PDFPageProxy, PDFJS } from "pdfjs-dist/webpack";
import { is_different } from "./misc";

interface Props {
    page: PDFPageProxy;
    scale: number;
    click_annotation: Function;
}

interface State {
    annotations?: PDFAnnotationData;
}

export class AnnotationLayer extends Component<Props, State> {
    private mounted: boolean;

    constructor(props) {
        super(props);
        this.state = { annotations: undefined };
    }

    shouldComponentUpdate(next_props: Props, next_state: State): boolean {
        return (
            is_different(this.props, next_props, ["scale"]) ||
            this.props.page.version !== next_props.page.version ||
            this.state.annotations !== next_state.annotations
        );
    }

    async update_annotations(page: PDFPageProxy): Promise<void> {
        try {
            let annotations = await page.getAnnotations();
            if (!this.mounted) return;
            this.setState({ annotations: annotations });
        } catch (err) {
            console.error(`pdf.js -- Error updating annotations: #{err}`);
            return;
        }
    }

    render_annotations(): Rendered {
        let scale = this.props.scale;
        let v: Rendered[] = [];
        for (let annotation of this.state.annotations) {
            if (annotation.subtype != "Link") {
                // We only care about link annotations *right now*, for the purposes of the latex editor.
                console.log("Annotation not implemented", annotation);
                continue;
            }
            let [x1, y1, x2, y2] = PDFJS.Util.normalizeRect(annotation.rect);
            let page_height = this.props.page.pageInfo.view[3];
            let left = x1 - 1,
                top = page_height - y2 - 1,
                width = x2 - x1 + 2,
                height = y2 - y1 + 1;

            let border = "";
            if (annotation.borderStyle.width) {
                border = `0.5px solid rgb(${annotation.color[0]}, ${
                    annotation.color[1]
                }, ${annotation.color[2]})`;
            }

            // Note: this "annotation" in the onClick below is the right one because we use "let"
            // *inside* the for loop above -- I'm not making the typical closure/scopying mistake.
            let elt = (
                <div
                    onClick={() => this.props.click_annotation(annotation)}
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
        return (
            <div
                style={{
                    position: "absolute"
                }}
            >
                {v}
            </div>
        );
    }

    componentWillReceiveProps(next_props: Props): void {
        if (this.props.page.version != next_props.page.version) {
            this.update_annotations(next_props.page);
        }
    }

    componentDidMount(): void {
        this.mounted = true;
        this.update_annotations(this.props.page);
    }

    componentWillUnmount(): void {
        this.mounted = false;
    }

    render() {
        if (!this.state.annotations) {
            return <div />;
        } else {
            return this.render_annotations();
        }
    }
}

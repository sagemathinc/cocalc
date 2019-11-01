/*
Render the annotation layer on top of a page.

The page itself could be rendered with either SVG or Canvas.

NOTE: For now we only render **link** annotations, and handle internal and external links.
We do NOT render any other annotations (e.g., notes, etc.), as would be produced code
like is here:  https://tex.stackexchange.com/questions/6306/how-to-annotate-pdf-files-generated-by-pdflatex
*/

const HIGHLIGHT_HEIGHT: number = 30;

import { Component, React, Rendered } from "../../app-framework";

import { PDFAnnotationData, PDFPageProxy } from "pdfjs-dist/webpack";

// Evidently the typescript code is wrong for this PDFJS.Util thing, so we use require.
const PDFJS = require("pdfjs-dist/webpack");

import { delay } from "awaiting";

import { is_different } from "smc-util/misc2";

export interface SyncHighlight {
  y: number;
  until: Date;
}

interface Props {
  page: PDFPageProxy;
  scale: number;
  click_annotation: Function;
  // If sync_highlight is set, draw a horizontal yellow highlight around
  // this y position, which fades out over the next few seconds.
  sync_highlight?: SyncHighlight;
}

interface State {
  annotations?: PDFAnnotationData;
  sync_highlight?: SyncHighlight;
}

export class AnnotationLayer extends Component<Props, State> {
  private mounted: boolean;
  private sync_highlight_number: number = 0;

  constructor(props) {
    super(props);
    this.state = { annotations: undefined, sync_highlight: undefined };
  }

  shouldComponentUpdate(next_props: Props, next_state: State): boolean {
    return (
      is_different(this.props, next_props, ["scale", "sync_highlight"]) ||
      this.props.page.version !== next_props.page.version ||
      is_different(this.state, next_state, ["annotations", "sync_highlight"])
    );
  }

  async update_annotations(page: PDFPageProxy): Promise<void> {
    try {
      const annotations = await page.getAnnotations();
      if (!this.mounted) return;
      this.setState({ annotations: annotations });
    } catch (err) {
      console.error(`pdf.js -- Error updating annotations: #{err}`);
      return;
    }
  }

  render_annotations(): Rendered {
    const scale = this.props.scale;
    const v: Rendered[] = [];
    for (const annotation of this.state.annotations) {
      if (annotation.subtype != "Link") {
        // We only care about link annotations *right now*, for the purposes of the latex editor.
        console.log("Annotation not implemented", annotation);
        continue;
      }
      const [x1, y1, x2, y2] = PDFJS.Util.normalizeRect(annotation.rect);
      const page_height = this.props.page.view[3];
      const left = x1 - 1,
        top = page_height - y2 - 1,
        width = x2 - x1 + 2,
        height = y2 - y1 + 1;

      let border = "";
      if (annotation.borderStyle.width) {
        border = `0.5px solid rgb(${annotation.color[0]}, ${annotation.color[1]}, ${annotation.color[2]})`;
      }

      // Note: this "annotation" in the onClick below is the right one because we use "let"
      // *inside* the for loop above -- I'm not making the typical closure/scopying mistake.
      const elt = (
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

    // handle highlight which is used for synctex.
    if (this.state.sync_highlight !== undefined) {
      v.push(
        this.render_sync_highlight(
          scale,
          this.props.page.view[2],
          this.state.sync_highlight.y
        )
      );
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

  render_sync_highlight(scale: number, width: number, y: number): Rendered {
    return (
      <div
        onDoubleClick={e => e.stopPropagation()}
        key={"sync"}
        style={{
          position: "absolute",
          top: (y - HIGHLIGHT_HEIGHT / 2) * scale,
          width: width * scale,
          height: HIGHLIGHT_HEIGHT * scale,
          opacity: 0.35,
          background: "yellow",
          border: "1px solid grey",
          boxShadow: "3px 3px 3px 0px #ddd"
        }}
      />
    );
  }

  componentWillReceiveProps(next_props: Props): void {
    if (this.props.page.version != next_props.page.version) {
      this.update_annotations(next_props.page);
    }
    if (next_props.sync_highlight !== undefined) {
      this.setState({ sync_highlight: next_props.sync_highlight });
      this.remove_sync_highlight(
        next_props.sync_highlight.until.valueOf() - new Date().valueOf()
      );
    }
  }

  async remove_sync_highlight(wait_ms: number): Promise<void> {
    this.sync_highlight_number += 1;
    const sync_highlight_number = this.sync_highlight_number;
    await delay(wait_ms);
    if (this.mounted && this.sync_highlight_number === sync_highlight_number) {
      this.setState({ sync_highlight: undefined });
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

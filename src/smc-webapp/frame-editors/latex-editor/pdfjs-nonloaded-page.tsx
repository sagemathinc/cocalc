/* Render a single PDF page using SVG */

import { PDFPageProxy } from "pdfjs-dist/webpack";

import { Component, React } from "../../app-framework";

import { is_different } from "smc-util/misc2";

interface Props {
  page: PDFPageProxy;
  scale: number;
}

export class NonloadedPage extends Component<Props, {}> {
  shouldComponentUpdate(next_props: Props) {
    return (
      is_different(this.props, next_props, ["scale"]) ||
      this.props.page.version != next_props.page.version
    );
  }

  render() {
    const viewport = this.props.page.getViewport(this.props.scale);
    let width = viewport.width + "px";
    let height = viewport.height + "px";
    return (
      <div
        style={{
          margin: "auto",
          background: "white",
          position: "relative",
          display: "inline-block"
        }}
      >
        <div style={{ width: width, height: height }} />
      </div>
    );
  }
}

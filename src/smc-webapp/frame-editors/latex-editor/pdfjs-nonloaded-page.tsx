/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PDFPageProxy } from "pdfjs-dist/webpack";

import { Component, React } from "../../app-framework";

interface Props {
  page: PDFPageProxy;
  scale: number;
}

export class NonloadedPage extends Component<Props, {}> {
  render() {
    const viewport = this.props.page.getViewport({ scale: this.props.scale });
    const width = viewport.width + "px";
    const height = viewport.height + "px";
    return (
      <div
        style={{
          margin: "auto",
          background: "white",
          position: "relative",
          display: "inline-block",
        }}
      >
        <div style={{ width: width, height: height }} />
      </div>
    );
  }
}

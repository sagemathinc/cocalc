/*
Render a static version of a diff of two versions of a document for use in TimeTravel.
*/

import { Component, React, Rendered } from "../../app-framework";

interface Props {
  doc1: any; // first value of the document (string or db object).
  doc2: any; // second value of the document (string or db object).
  path: string; // filename of doc, which determines what sort of editor it uses
}

export class Diff extends Component<Props> {
  public render(): Rendered {
    return (
      <div>
        {this.props.path}: {this.props.doc1} diff {this.props.doc2}
      </div>
    );
  }
}

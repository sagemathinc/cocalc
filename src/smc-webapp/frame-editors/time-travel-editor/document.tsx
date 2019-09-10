/*
Render a static version of a document for use in TimeTravel.
*/

import { Component, React, Rendered } from "../../app-framework";

interface Props {
  doc: any; // actual value of the document (string or db object).
  path: string; // filename of doc, which determines what sort of editor it uses
}

export class Document extends Component<Props> {
  public render_other(): Rendered {
    return <div>{JSON.stringify(this.props.doc)}</div>;
  }

  public render_string(): Rendered {
    // TODO: codemirror static, etc.
    return (
      <pre
        style={{ width: "100%", padding: "15px", border: "1px solid black" }}
      >
        {this.props.doc.value}
      </pre>
    );
  }
  public render(): Rendered {
    if (this.props.doc != null && typeof this.props.doc.value == "string") {
      return this.render_string();
    } else {
      return this.render_other();
    }
  }
}

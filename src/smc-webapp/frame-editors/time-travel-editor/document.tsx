/*
Render a static version of a document for use in TimeTravel.
*/

import { Component, React, Rendered } from "../../app-framework";

import { fromJS, Map } from "immutable";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { TimeTravelActions } from "./actions";

interface Props {
  id: string;
  actions: TimeTravelActions;
  font_size: number;
  doc: any; // actual value of the document (string or db object).
  path: string; // filename of doc, which determines what sort of editor it uses
  project_id: string;
  editor_settings: Map<string, any>;
}

export class Document extends Component<Props> {
  public render_other(): Rendered {
    return <div>{JSON.stringify(this.props.doc)}</div>;
  }

  public render_string(): Rendered {
    if (this.props.doc == null || typeof this.props.doc.value != "string") {
      throw Error("bug -- invalid input"); // can't happen
    }
    return (
      <CodemirrorEditor
        id={this.props.id}
        actions={this.props.actions}
        path={this.props.path}
        project_id={this.props.project_id}
        font_size={this.props.font_size}
        cursors={fromJS({})}
        editor_state={fromJS({})}
        read_only={true}
        is_current={true}
        is_public={true}
        value={this.props.doc.value}
        misspelled_words={fromJS([])}
        resize={0}
        gutters={[]}
        gutter_markers={fromJS({})}
        editor_settings={this.props.editor_settings}
      />
    );
  }

  private render_body(): Rendered {
    if (this.props.doc != null && typeof this.props.doc.value == "string") {
      return this.render_string();
    } else {
      return this.render_other();
    }
  }

  public render(): Rendered {
    return (
      <div className="smc-vfill" style={{ overflowY: "auto" }}>
        {this.render_body()}
      </div>
    );
  }
}

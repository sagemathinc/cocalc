/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
  doc: string;
  path: string; // filename of doc, which determines what sort of editor it uses
  project_id: string;
  editor_settings: Map<string, any>;
}

export class Document extends Component<Props> {
  private render_body(): Rendered {
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
        value={this.props.doc}
        misspelled_words={fromJS([])}
        resize={0}
        gutters={[]}
        gutter_markers={fromJS({})}
        editor_settings={this.props.editor_settings}
      />
    );
  }

  public render(): Rendered {
    return (
      <div className="smc-vfill" style={{ overflowY: "auto" }}>
        {this.render_body()}
      </div>
    );
  }
}

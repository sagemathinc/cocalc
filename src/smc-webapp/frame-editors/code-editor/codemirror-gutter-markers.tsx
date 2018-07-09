/*
Component that manages rendering all the gutter markers associated to a Codemirror editor.
*/

import { React, Component, Rendered } from "../../app-framework";
import { GutterMarker } from "./codemirror-gutter-marker";
import * as CodeMirror from "codemirror";

export interface GutterSpec {
  handle?: CodeMirror.LineHandle;
  line: number;
  gutter_id: string;
  component: Rendered;
}

interface Props {
  gutter_markers: Map<string, any>;
  codemirror: CodeMirror.Editor;
  set_handle: Function;
}

export class GutterMarkers extends Component<Props, {}> {
  shouldComponentUpdate(props): boolean {
    return this.props.gutter_markers !== props.gutter_markers;
  }

  render_gutter(id: string, info: GutterSpec): Rendered {
    let line: number | undefined;
    const handle = info.handle;
    if (handle != null) {
      let lineInfo = this.props.codemirror.lineInfo(handle);
      if (lineInfo !== undefined) {
        line = lineInfo.line;
      }
      if (line === undefined) {
        // skip adding this gutter, since it is no longer defined (e.g., the line it was in was deleted from doc)
        return;
      }
    }
    if (line === undefined) {
      line = info.line;
    }
    return (
      <GutterMarker
        key={id as string}
        codemirror={this.props.codemirror}
        line={line}
        gutter_id={info.gutter_id}
        set_handle={handle => this.props.set_handle(id, handle)}
      >
        {info.component}
      </GutterMarker>
    );
  }

  render_gutters(): Rendered[] {
    const v: Rendered[] = [];
    this.props.gutter_markers.forEach((info, id) => {
      v.push(this.render_gutter(id, info.toJS()));
    });
    return v;
  }

  render() {
    return <span>{this.render_gutters()}</span>;
  }
}

import { React, Component, Rendered } from "../../app-framework";

import { Map, Set } from "immutable";


import { CodemirrorEditor } from "../code-editor/codemirror-editor";

interface Props {
  id: string;
  input: string;
  actions: any;

  path : string;
  project_id : string;
  font_size : number;
  cursors : Map<string,any>;
  editor_state : Map<string,any>;
  read_only : boolean;
  is_current: boolean;
  is_public: boolean;
  misspelled_words : Set<string>;
  resize : number;
  gutters: string[];
  gutter_markers: Map<string, any>;
  editor_settings: Map<string, any>;

  value? : string;
}

interface State {
  input: string;
}

export class InputCell extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { input: this.props.input };
  }

  render_codemirror(): Rendered {
    return (
      <CodemirrorEditor
        id={this.props.id}
        actions={this.props.actions}
        path={"." + this.props.id + '-' + this.props.path}
        project_id={this.props.project_id}
        font_size={this.props.font_size}
        cursors={this.props.cursors}
        editor_state={this.props.editor_state}
        read_only={this.props.read_only}
        is_current={this.props.is_current}
        is_public={this.props.is_public}
        value={this.props.value}
        misspelled_words={this.props.misspelled_words}
        resize={this.props.resize}
        gutters={this.props.gutters}
        gutter_markers={this.props.gutter_markers}
        editor_settings={this.props.editor_settings}
      />
    );
  }

  render(): Rendered {
    return this.render_codemirror();
  }
}

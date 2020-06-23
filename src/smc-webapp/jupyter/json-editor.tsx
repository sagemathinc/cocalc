/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A JSON Editor

This is just built using codemirror for now.

****NOTE:** This code is not used right now!  It can safely be deleted so long as you delete the places it is imported.  It's not user visible.**

SEE https://github.com/sagemathinc/cocalc/issues/4295
*/

import { React, Component } from "../app-framework";
const json_stable = require("json-stable-stringify");
import { make_patch, apply_patch } from "smc-util/sync/editor/generic/util";
import * as immutable from "immutable";
import * as underscore from "underscore";
declare const CodeMirror: any; // TODO: import this

const ERROR_STYLE: React.CSSProperties = {
  color: "white",
  background: "red",
  padding: "5px",
  position: "absolute",
  zIndex: 5,
  width: "50%",
  right: "0",
  borderRadius: "3px",
  boxShadow: "0px 0px 3px 2px rgba(87, 87, 87, 0.2)",
};

interface JSONEditorProps {
  value: immutable.Map<any, any>; // must be immutable all the way and JSON-able...
  font_size?: number; // font_size not explicitly used, but it is critical
  // to re-render on change so Codemirror recomputes itself!
  on_change(obj: any): void; // on_change(obj) -- called with JSON-able object
  cm_options: immutable.Map<any, any>;
  undo?(): void;
  redo?(): void;
}

interface JSONEditorState {
  error?: any;
}

export class JSONEditor extends Component<JSONEditorProps, JSONEditorState> {
  private cm: any;
  private _cm_last_save: any;
  private refNode: HTMLElement;
  constructor(props: JSONEditorProps, context: any) {
    super(props, context);
    this.state = {};
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      this.props.font_size !== nextProps.font_size ||
      !this.props.value.equals(nextProps.value) ||
      this.props.cm_options !== nextProps.cm_options ||
      this.state.error !== nextState.error
    );
  }

  componentDidMount() {
    this.init_codemirror();
  }

  _cm_destroy = () => {
    if (this.cm == null) {
      return;
    }
    $(this.cm.getWrapperElement()).remove(); // remove from DOM
    return delete this.cm;
  };

  _cm_save = () => {
    let obj: any;
    if (this.cm == null) {
      return;
    }
    const value = this.cm.getValue();
    if (value === this._cm_last_save) {
      return value;
    }
    try {
      obj = JSON.parse(value);
    } catch (error) {
      this.setState({ error: `${error}` });
      return;
    }
    this._cm_last_save = value;
    this.props.on_change(obj);
    this.clear_error();
    return value;
  };

  clear_error = () => {
    if (this.state.error) {
      return this.setState({ error: undefined });
    }
  };

  _cm_merge_remote = (remote) => {
    let new_val: any;
    if (this.cm == null) {
      return;
    }
    const local = this.cm.getValue();
    remote = this.to_json(remote);
    if (local !== this._cm_last_save) {
      // merge in our local changes
      const local_changes = make_patch(this._cm_last_save, local);
      new_val = apply_patch(local_changes, remote)[0];
    } else {
      // just set to remote value
      this._cm_last_save = new_val = remote;
      this.clear_error();
    }
    this.cm.setValueNoJump(new_val);
  };

  _cm_undo = () => {
    if (this.cm == null) {
      return;
    }
    if (this._cm_save()) {
      this.props.undo && this.props.undo();
    }
  };

  _cm_redo = () => {
    if (this.cm == null) {
      return;
    }
    this.props.redo && this.props.redo();
  };

  update_codemirror_options(next, current) {
    if (this.cm == null) {
      return;
    }
    const next_options = this.options(next);
    next.forEach((value: any, option: any) => {
      if (value !== current.get(option)) {
        value = (value != null && value.toJS && value.toJS()) || value;
        this.cm.setOption(option, next_options[option]);
      }
    });
  }

  options(cm_options: any) {
    const options = cm_options.toJS();
    options.mode = { name: "application/json" };
    options.indentUnit = options.tabSize = 1;
    options.indentWithTabs = false;
    options.foldGutter = true;
    options.extraKeys["Ctrl-Q"] = (cm: any) => cm.foldCodeSelectionAware();
    options.extraKeys["Tab"] = (cm: any) => cm.tab_as_space();
    options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"];
    return options;
  }

  to_json(obj: any) {
    if (immutable.Map.isMap(obj)) {
      obj = obj.toJS();
    }
    return json_stable(obj, { space: 1 });
  }

  init_codemirror = () => {
    const node = $(this.refNode).find("textarea")[0];
    // TODO: why is "as any" required here
    this.cm = CodeMirror.fromTextArea(
      node as any,
      this.options(this.props.cm_options)
    );
    $(this.cm.getWrapperElement()).css({ height: "100%" });
    this._cm_last_save = this.to_json(this.props.value);
    this.cm.setValue(this._cm_last_save);
    const save = underscore.debounce(this._cm_save, 3000);
    this.cm.on("change", (_: any, changeObj: any) => {
      if (changeObj.origin !== "setValue") {
        save();
      }
    });
    // replace undo/redo by our multi-user sync aware versions
    this.cm.undo = this._cm_undo;
    this.cm.redo = this._cm_redo;
  };

  componentWillReceiveProps(nextProps) {
    if (!this.props.cm_options.equals(nextProps.cm_options)) {
      this.update_codemirror_options(
        nextProps.cm_options,
        this.props.cm_options
      );
    }
    if (this.props.font_size !== nextProps.font_size) {
      if (this.cm != null) {
        this.cm.refresh();
      }
    }
    if (!nextProps.value.equals(this.props.value)) {
      this._cm_merge_remote(nextProps.value);
    }
  }

  componentWillUnmount() {
    if (this.cm == null) {
      return;
    }
    this._cm_save();
    this._cm_destroy();
  }

  render_error() {
    if (!this.state.error) {
      return;
    }
    return <div style={ERROR_STYLE}>ERROR: {this.state.error}</div>;
  }

  render() {
    return (
      <div
        ref={(node: any) => (this.refNode = node)}
        style={{
          width: "100%",
          overflow: "auto",
          height: "100%",
          position: "relative",
        }}
      >
        {this.render_error()}
        <textarea />
      </div>
    );
  }
}

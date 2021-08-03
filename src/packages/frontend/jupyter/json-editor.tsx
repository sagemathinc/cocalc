/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A JSON Editor

This is just built using codemirror for now.

There is a ticket regarding removing this component, but it is currently used for the "raw" view.
SEE https://github.com/sagemathinc/cocalc/issues/4295
*/

import { React, useRef, useState, usePrevious } from "../app-framework";
const json_stable = require("json-stable-stringify");
import { make_patch, apply_patch } from "@cocalc/util/sync/editor/generic/util";
import * as immutable from "immutable";
import * as underscore from "underscore";
import * as CodeMirror from "codemirror";
import { all_fields_equal } from "@cocalc/util/misc";

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
} as const;

interface JSONEditorProps {
  value: immutable.Map<any, any>; // must be immutable all the way and JSON-able...
  font_size?: number; // font_size not explicitly used, but it is critical
  // to re-render on change so Codemirror recomputes itself!
  on_change(obj: any): void; // on_change(obj) -- called with JSON-able object
  cm_options: immutable.Map<any, any>;
  undo?(): void;
  redo?(): void;
}

function should_memoize(prev, next) {
  return (
    all_fields_equal(prev, next, ["font_size", "cm_options"]) &&
    prev.value.equals(next.value)
  );
}

export const JSONEditor: React.FC<JSONEditorProps> = React.memo(
  (props: JSONEditorProps) => {
    const { value, font_size, on_change, cm_options, undo, redo } = props;

    const prev_cm_options = usePrevious(cm_options);
    const prev_value = usePrevious(value);

    const [error, set_error] = useState<string>();

    const cm = useRef<any>(null);
    const cm_last_save = useRef<any>(null);
    const refNode = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      init_codemirror();
      return () => {
        if (cm.current == null) {
          return;
        }
        cm_save();
        cm_destroy();
      };
    }, []);

    React.useEffect(() => {
      if (!cm_options.equals(prev_cm_options)) {
        update_codemirror_options(cm_options, prev_cm_options);
      }
    }, [cm_options]);

    React.useEffect(() => {
      cm.current?.refresh();
    }, [font_size]);

    React.useEffect(() => {
      if (!value.equals(prev_value)) {
        cm_merge_remote(value);
      }
    }, [value]);

    function cm_destroy(): void {
      if (cm.current == null) {
        return;
      }
      $(cm.current.getWrapperElement()).remove(); // remove from DOM
      cm.current = null;
    }

    function cm_save() {
      let obj: any;
      if (cm.current == null) {
        return;
      }
      const value = cm.current.getValue();
      if (value === cm_last_save.current) {
        return value;
      }
      try {
        obj = JSON.parse(value);
      } catch (error) {
        set_error(`${error}`);
        return;
      }
      cm_last_save.current = value;
      on_change(obj);
      clear_error();
      return value;
    }

    function clear_error(): void {
      if (error) {
        set_error(undefined);
      }
    }

    function cm_merge_remote(remote) {
      let new_val: any;
      if (cm.current == null) {
        return;
      }
      const local = cm.current.getValue();
      remote = to_json(remote);
      if (local !== cm_last_save.current) {
        // merge in our local changes
        const local_changes = make_patch(cm_last_save.current, local);
        new_val = apply_patch(local_changes, remote)[0];
      } else {
        // just set to remote value
        cm_last_save.current = new_val = remote;
        clear_error();
      }
      cm.current.setValueNoJump(new_val);
    }

    function cm_undo() {
      if (cm.current == null) {
        return;
      }
      if (cm_save()) {
        undo && undo();
      }
    }

    function cm_redo() {
      if (cm.current == null) {
        return;
      }
      redo && redo();
    }

    function update_codemirror_options(next, current) {
      if (cm.current == null) {
        return;
      }
      const next_options = options(next);
      next.forEach((value: any, option: string) => {
        if (value !== current?.get(option)) {
          if (option != "inputStyle") {
            // note: inputStyle can not (yet) be changed in a running editor
            // -- see https://github.com/sagemathinc/cocalc/issues/5383
            cm.current.setOption(option, next_options[option]);
          }
        }
      });
    }

    function options(cm_options: any) {
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

    function to_json(obj: any) {
      if (immutable.Map.isMap(obj)) {
        obj = obj.toJS();
      }
      return json_stable(obj, { space: 1 });
    }

    function init_codemirror() {
      if (refNode.current == null) return;
      const node = $(refNode.current).find("textarea")[0];
      // TODO: why is "as any" required here
      cm.current = CodeMirror.fromTextArea(node as any, options(cm_options));
      $(cm.current.getWrapperElement()).css({ height: "100%" });
      cm_last_save.current = to_json(value);
      cm.current.setValue(cm_last_save.current);
      const save = underscore.debounce(cm_save, 3000);
      cm.current.on("change", (_: any, changeObj: any) => {
        if (changeObj.origin !== "setValue") {
          save();
        }
      });
      // replace undo/redo by our multi-user sync aware versions
      cm.current.undo = cm_undo;
      cm.current.redo = cm_redo;
    }

    function render_error() {
      if (!error) {
        return;
      }
      return <div style={ERROR_STYLE}>ERROR: {error}</div>;
    }

    return (
      <div
        ref={refNode}
        style={{
          width: "100%",
          overflow: "auto",
          height: "100%",
          position: "relative",
        }}
      >
        {render_error()}
        <textarea />
      </div>
    );
  },
  should_memoize
);

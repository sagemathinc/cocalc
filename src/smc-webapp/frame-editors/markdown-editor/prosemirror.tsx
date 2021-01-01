/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows editing of rendered markdown.

/* TODO:

#v0
- [ ] bug in lists: #upstream -- https://github.com/ProseMirror/prosemirror-markdown/issues/51
- [ ] font size/zoom.

#v1
- [ ] use our undo/redo, not prosemirror's
- [ ] use our own toolbar and editing, not prosemirror's (e.g., the insert image/link popups don't even appear)
- [ ] checkbox support -- maybe https://github.com/ProseMirror/prosemirror-markdown/issues/42 is relevant
- [ ] unclear -- run prettier to make things more canonical?
- [ ] show cursors for other users
- [ ] katex/mathjax rendering (and editing?)
- [ ] forward/inverse search/sync
- [ ] drag and drop images and file attachments
- [ ] maintain scroll position and cursor/selection state between sessions.
*/

import { SAVE_DEBOUNCE_MS } from "../code-editor/const";
import { debounce } from "lodash";
import { React, ReactDOM, useEffect, useRef } from "../../app-framework";

import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import {
  schema,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";

// I will likely remove using prosemirror-example-setup; be sure to npm uninstall it when I do:
import { exampleSetup } from "prosemirror-example-setup";
import "prosemirror-menu/style/menu.css";

import "./prosemirror.css";
import { Actions } from "./actions";

interface Props {
  actions: Actions;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value: string;
  reload_images: boolean;
}

const plugins = exampleSetup({ schema });

export const ProseMirrorMarkdown: React.FC<Props> = ({
  actions,
  font_size,
  value,
}) => {
  const viewRef = useRef<any>(null);
  const divRef = useRef<any>(null);
  const lastSavedValueRef = useRef<string>("");

  // We don't want to do save_value too much, since it presumably can be slow,
  // especially if the document is large. By debouncing, we only do this when
  // the user pauses typing for a moment. Also, this avoids making too many commits.
  const save_value = debounce(() => {
    const view = viewRef.current;
    if (view == null) return;
    const new_value = defaultMarkdownSerializer.serialize(view.state.doc);
    lastSavedValueRef.current = new_value;
    console.log("saving editor state ", { new_value });
    actions.set_value(new_value);
  }, SAVE_DEBOUNCE_MS);

  // once when mounted
  useEffect(() => {
    const target = ReactDOM.findDOMNode(divRef.current);
    if (target != null) {
      viewRef.current = new EditorView(target, {
        state: EditorState.create({
          doc: defaultMarkdownParser.parse(value),
          plugins,
        }),
        dispatchTransaction(transaction) {
          const view = viewRef.current;
          if (view == null) return;
          const newState = view.state.apply(transaction);
          view.updateState(newState);
          save_value();
        },
      });
    }
    (window as any).x = {
      EditorState,
      defaultMarkdownSerializer,
      view: viewRef.current,
      defaultMarkdownParser,
    };
    return () => {
      viewRef.current?.destroy();
      viewRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (viewRef.current == null || lastSavedValueRef.current == value) return;
    console.log("setting editor state to ", { value });
    const state = EditorState.create({
      doc: defaultMarkdownParser.parse(value),
      plugins,
    });
    viewRef.current.updateState(state);
  }, [value]);

  return (
    <div
      style={{ margin: "0 10px", overflowY: "auto", fontSize: font_size }}
      className="smc-vfill"
      ref={divRef}
    ></div>
  );
};

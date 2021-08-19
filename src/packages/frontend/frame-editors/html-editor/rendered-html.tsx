/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Component that shows rendered HTML.
*/

import { delay } from "awaiting";
import { is_different, path_split } from "@cocalc/util/misc";
import { throttle } from "lodash";
import { React, ReactDOM } from "../../app-framework";
import { MAX_WIDTH } from "../options";
import { HTML } from "@cocalc/frontend/r_misc";
import { EditorState } from "../frame-tree/types";

interface Props {
  id: string;
  actions: any;
  path: string;
  project_id: string;
  font_size: number;
  value?: string;
  editor_state: EditorState;
}

function should_memoize(prev, next) {
  return !is_different(prev, next, [
    "id",
    "project_id",
    "path",
    "font_size",
    "value",
  ]);
}

export const QuickHTMLPreview: React.FC<Props> = React.memo((props: Props) => {
  const {
    id,
    actions,
    path,
    project_id,
    font_size,
    value,
    editor_state,
  } = props;

  const scroll_ref = React.useRef(null);

  function on_scroll(): void {
    const elt = ReactDOM.findDOMNode(scroll_ref.current);
    if (elt == null) return;

    const scroll = $(elt).scrollTop();
    actions.save_editor_state(id, { scroll });
  }

  React.useEffect(function () {
    for (const wait of [0, 200, 500]) {
      restore_scroll(wait);
    }
  }, []);

  async function restore_scroll(wait?: number): Promise<void> {
    if (wait) {
      await delay(wait);
    }
    const scroll: number | undefined = editor_state.get("scroll");
    if (scroll !== undefined) {
      $(ReactDOM.findDOMNode(scroll_ref.current)).scrollTop(scroll);
    }
  }

  function post_hook(elt) {
    //  make html even more sane for editing inside cocalc (not an iframe)
    elt.find("link").remove(); // gets rid of external CSS style
    elt.find("style").remove();
  } // gets rid of inline CSS style

  return (
    <div
      style={{
        overflowY: "auto",
        width: "100%",
        fontSize: `${font_size}px`,
      }}
      ref={scroll_ref}
      onScroll={throttle(() => on_scroll(), 250)}
      className={"cocalc-editor-div"}
    >
      <div
        style={{
          maxWidth: MAX_WIDTH,
          margin: "10px auto",
          padding: "0 10px",
        }}
      >
        <HTML
          value={value}
          project_id={project_id}
          file_path={path_split(path).head}
          safeHTML={true}
          post_hook={post_hook}
        />
      </div>
    </div>
  );
}, should_memoize);

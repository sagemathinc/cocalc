/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Component that shows rendered HTML.
*/

import { delay } from "awaiting";
import { throttle } from "lodash";
import { React, ReactDOM } from "../../app-framework";
import { MAX_WIDTH } from "../options";
import { EditorState } from "../frame-tree/types";
import HTML from "@cocalc/frontend/components/html-ssr";
import { FileContext, useFileContext } from "@cocalc/frontend/lib/file-context";

interface Props {
  id: string;
  actions: any;
  font_size: number;
  value?: string;
  editor_state: EditorState;
}

export default function SanitizedPreview({
  id,
  actions,
  font_size,
  value,
  editor_state,
}: Props) {
  const fileContext = useFileContext();
  const scrollRef = React.useRef(null);

  function on_scroll(): void {
    const elt = ReactDOM.findDOMNode(scrollRef.current);
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
      $(ReactDOM.findDOMNode(scrollRef.current)).scrollTop(scroll);
    }
  }

  return (
    <div
      style={{
        overflowY: "auto",
        width: "100%",
        fontSize: `${font_size}px`,
      }}
      ref={scrollRef}
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
        <FileContext.Provider value={{ ...fileContext, noSanitize: false }}>
          <HTML value={value ?? ""} />
        </FileContext.Provider>
      </div>
    </div>
  );
}

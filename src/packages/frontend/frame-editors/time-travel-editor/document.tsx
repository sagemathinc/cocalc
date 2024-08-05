/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render a static version of a document for use in TimeTravel.
*/

import { fromJS } from "immutable";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";

export function TextDocument(props) {
  return (
    <div className="smc-vfill" style={{ overflowY: "auto" }}>
      <CodemirrorEditor
        {...props}
        cursors={fromJS({})}
        editor_state={fromJS({})}
        read_only={true}
        is_current={true}
        is_public={true}
        misspelled_words={fromJS([]) as any}
        resize={0}
        gutters={[]}
        gutter_markers={fromJS({}) as any}
      />
    </div>
  );
}

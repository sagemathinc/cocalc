/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Code Editor Actions (string docs)

Historically this file implemented the base Actions class used by many editors.
That made string-only behavior (to_str, SyncAdapter) leak into structured
editors. This file now re-exports the text-focused implementation from the
base-editor actions.
*/

export {
  TextEditorActions as Actions,
  type CodeEditorState,
} from "../base-editor/actions-text";

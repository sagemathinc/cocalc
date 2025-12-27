/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Structured Editor Actions

Extends BaseEditorActions for non-string documents (syncdb/immer). This avoids
any string-specific merge wiring (to_str/SyncAdapter) used by text editors.
*/

import type { CodeEditorState } from "./actions-base";
import { BaseEditorActions } from "./actions-base";

export class StructuredEditorActions<
  T extends CodeEditorState = CodeEditorState,
> extends BaseEditorActions<T> {}

export { StructuredEditorActions as Actions };
export type { CodeEditorState };

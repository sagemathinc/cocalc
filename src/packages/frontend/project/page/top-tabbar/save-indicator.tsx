/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useRedux } from "@cocalc/frontend/app-framework";
import { SaveButton } from "@cocalc/frontend/frame-editors/frame-tree/save-button";
import { EditorActions } from "./types";

interface TopBarSaveButtonProps {
  name: string;
  actions: EditorActions;
  compact?: boolean;
}

export function TopBarSaveButton({
  name,
  actions,
  compact = false,
}: TopBarSaveButtonProps): JSX.Element | null {
  const read_only: boolean = useRedux([name, "read_only"]);
  const has_unsaved_changes: boolean = useRedux([name, "has_unsaved_changes"]);
  const has_uncommitted_changes: boolean = useRedux([
    name,
    "has_uncommitted_changes",
  ]);
  const show_uncommitted_changes: boolean = useRedux([
    name,
    "show_uncommitted_changes",
  ]);
  const is_saving: boolean = useRedux([name, "is_saving"]);
  const is_public: boolean = useRedux([name, "is_public"]);

  // test, if actions has the method set_show_uncommitted_changes
  // an "actions instanceof CodeEditorActions" does not work. TODO figure out why...
  const isCodeEditorActions =
    (actions as any).set_show_uncommitted_changes != null;

  const hasSaveToDisk = typeof (actions as any).save_to_disk === "function";

  return (
    <SaveButton
      has_unsaved_changes={has_unsaved_changes}
      has_uncommitted_changes={has_uncommitted_changes}
      show_uncommitted_changes={show_uncommitted_changes}
      set_show_uncommitted_changes={
        isCodeEditorActions
          ? (actions as any).set_show_uncommitted_changes
          : undefined
      }
      read_only={read_only}
      is_public={is_public}
      is_saving={is_saving}
      no_labels={compact}
      size={24}
      style={{}}
      onClick={() => {
        if (isCodeEditorActions) {
          (actions as any).save(true);
          (actions as any).explicit_save();
        }
        if (hasSaveToDisk) {
          (actions as any).save_to_disk?.();
        } else {
          console.warn("No save_to_disk method on actions", actions.name);
        }
      }}
    />
  );
}

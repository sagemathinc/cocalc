/* Keyboard handler

The official Photoshop keyboard shortcuts are here and can be useful inspiration:
   https://helpx.adobe.com/photoshop/using/default-keyboard-shortcuts.html
*/

import { Actions } from "./actions";
import { TOOLS, Tool } from "./tools/spec";
import { DEFAULT_FONT_SIZE } from "./tools/defaults";
import { centerOfRect } from "./math";

const selectTool: { [key: string]: Tool } = {};
for (const tool in TOOLS) {
  const { key } = TOOLS[tool];
  if (key == null) continue;
  if (typeof key == "string") {
    selectTool[key] = tool;
  } else {
    for (const k of key) {
      selectTool[k] = tool;
    }
  }
}

const KEY_TO_POINT = {
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  arrowright: { x: 1, y: 0 },
  arrowleft: { x: -1, y: 0 },
};

export default function getKeyHandler(
  actions: Actions,
  frameId: string
): (event) => void {
  return (e) => {
    const node = actions._get_frame_node(frameId);
    if (node == null) return;
    if (e?.key == null) {
      // an issue with e.key being defined was reported by a user.
      return;
    }
    const key = e.key.toLowerCase();
    //console.log(key);

    if (key == "s" && (e.metaKey || e.ctrlKey)) {
      actions.save(true);
      e.preventDefault();
      return;
    }
    // These zoom shortcuts aren't documented in the tooltips, but they
    // are consistent with the rest of cocalc and won't interfere with editing.
    if (key == "," && e.shiftKey && e.ctrlKey) {
      actions.decrease_font_size(frameId);
      return;
    }
    if (key == "." && e.shiftKey && e.ctrlKey) {
      actions.increase_font_size(frameId);
      return;
    }

    if (key == "escape" && node.get("selectedTool") == "edge") {
      actions.clearEdgeCreateStart(frameId);
      return;
    }

    const selection = node.get("selection");
    if (selection != null && selection.size > 0) {
      if (key.startsWith("arrow") && !node.get("editFocus")) {
        // Arrow keys but not editing, so move all selected objects 1 pixel:
        const p = KEY_TO_POINT[key];
        if (p != null) {
          actions.moveElements(selection, p);
          return;
        }
      }

      if (selection.size >= 1) {
        if (key == "escape") {
          if (node.get("editFocus")) {
            // currently editing something, e.g., text -- so step out of that.
            actions.setEditFocus(frameId, false);
          } else {
            // not editing anything, so deselect element.
            actions.clearSelection(frameId);
          }
          return;
        }
      }
      if (selection.size == 1) {
        // Exactly one element is selected.
        if (node.get("editFocus")) {
          // do NOT use any keyboard shortcut on anything editable via the keyboard when editing.
          return;
        } else if (key == "enter") {
          // not in editFocus mode but hit enter, so switch to editFocus
          actions.setEditFocus(frameId, true);
          e.preventDefault(); // so enter doesn't go to editor after switching to edit mode.
        }
      }
    }

    if (activeElementIsInput() || node.get("editFocus")) return;

    if (selection == null || selection.size == 0) {
      // nothing selected.
      if (key.startsWith("arrow")) {
        // arrow key with no selection - -move canvas center.
        const viewport = node.get("viewport")?.toJS();
        if (viewport != null) {
          const center = centerOfRect(viewport);
          const pt = KEY_TO_POINT[key];
          if (pt != null) {
            center.x += pt.x * 10;
            center.y += pt.y * 10;
            actions.setViewportCenter(frameId, center);
          }
        }
      }
    }

    if (key == "z" && (e.metaKey || e.ctrlKey)) {
      if (e.shiftKey) {
        actions.redo();
      } else {
        actions.undo();
      }
      return;
    }
    if (key == "-") {
      actions.decrease_font_size(frameId);
      return;
    }
    if (key == "=") {
      actions.increase_font_size(frameId);
      return;
    }
    if (key == "0") {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        actions.fitToScreen(frameId);
        return;
      }
      if (!e.shiftKey) {
        actions.set_font_size(frameId, DEFAULT_FONT_SIZE);
        return;
      }
    }
    if (key == "m") {
      actions.toggleMapType(frameId);
      return;
    }
    if (key == "backspace" || key == "delete") {
      actions.deleteElements(
        selection?.toJS().map((id) => ({
          id,
        }))
      );
      actions.clearSelection(frameId);
      return;
    }
    if (!(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
      const tool = selectTool[key];
      if (tool != null) {
        actions.setSelectedTool(frameId, tool);
        return;
      }
    }
  };
}

const inputs = ["input", "select", "button", "textarea"];
function activeElementIsInput(): boolean {
  const activeElement = document.activeElement;
  return (
    activeElement != null &&
    inputs.includes(activeElement.tagName.toLowerCase())
  );
}

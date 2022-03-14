/* Keyboard handler

The official Photoshop keyboard shortcuts are here and can be useful inspiration:
   https://helpx.adobe.com/photoshop/using/default-keyboard-shortcuts.html
*/

import { Actions } from "./actions";
import { TOOLS, Tool } from "./tools/spec";
import { DEFAULT_FONT_SIZE } from "./tools/defaults";

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

export default function getKeyHandler(
  actions: Actions,
  frameId: string
): (event) => void {
  return (e) => {
    const node = actions._get_frame_node(frameId);
    if (node == null) return;
    const key = e.key.toLowerCase();

    // These always get handled by the global handler:
    if (key == "z" && (e.metaKey || e.ctrlKey)) {
      if (e.shiftKey) {
        actions.redo();
      } else {
        actions.undo();
      }
      return;
    }
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

    const selection = node.get("selection");
    if (selection?.size == 1) {
      // Exactly one element is selected.
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
      if (node.get("editFocus")) {
        // do NOT use any keyboard shortcut on anything editable via the keyboard when editing.
        return;
      }
    }

    if (activeElementIsInput()) return;

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

/* Keyboard handler */

import { Actions } from "./actions";
import { TOOLS, Tool } from "./tools/spec";
import { ZOOM100 } from "./math";

const selectTool: { [key: string]: Tool } = {};
for (const tool in TOOLS) {
  const { key } = TOOLS[tool];
  if (key) {
    selectTool[key] = tool;
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
    if (selection.size == 1) {
      // An element is focused
      // TOOD: For now, we allow for escape, though it would be better for that to have multiple steps...
      if (key == "escape") {
        actions.clearSelection(frameId);
        return;
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
        actions.set_font_size(frameId, ZOOM100);
        return;
      }
    }
    if (key == "m") {
      actions.toggleMapType(frameId);
      return;
    }
    const tool = selectTool[key];
    if (tool != null) {
      actions.setSelectedTool(frameId, tool);
      return;
    }
  };
}

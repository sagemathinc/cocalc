import type {
  FrameExtensionDefinition,
  FrameExtensionDefinitionInput,
} from "./types";
import {
  normalizeExtensionSource,
  normalizeFrameDefinition,
  validateNamespacedId,
} from "./validate";

export function defineFrame(
  definition: FrameExtensionDefinitionInput,
): FrameExtensionDefinition {
  validateNamespacedId("frame extension id", definition.id);
  if (
    !Array.isArray(definition.targetEditors) ||
    definition.targetEditors.length === 0
  ) {
    throw new Error("frame extensions must target at least one editor id");
  }
  for (const editorId of definition.targetEditors) {
    validateNamespacedId("target editor id", editorId);
  }

  return {
    ...definition,
    kind: "frame",
    source: normalizeExtensionSource(definition.source),
    targetEditors: [...new Set(definition.targetEditors)],
    frame: normalizeFrameDefinition(definition.frame.type, definition.frame),
  };
}

import type {
  EditorExtensionDefinition,
  EditorExtensionDefinitionInput,
} from "./types";
import {
  normalizeExtensionSource,
  normalizeExtensions,
  normalizeFilenames,
  normalizeNativeFrames,
  normalizeFrameDefinition,
  validateFrameTree,
  validateNamespacedId,
} from "./validate";

export function defineEditor(
  definition: EditorExtensionDefinitionInput,
): EditorExtensionDefinition {
  validateNamespacedId("editor id", definition.id);
  if (
    definition.frames == null ||
    Object.keys(definition.frames).length === 0
  ) {
    throw new Error("editor extensions must define at least one frame");
  }

  const frames = Object.fromEntries(
    Object.entries(definition.frames).map(([type, frame]) => [
      type,
      normalizeFrameDefinition(type, frame),
    ]),
  );

  return {
    ...definition,
    kind: "editor",
    source: normalizeExtensionSource(definition.source),
    extensions: normalizeExtensions(definition.extensions),
    filenames: normalizeFilenames(definition.filenames),
    nativeFrames: normalizeNativeFrames(definition.nativeFrames),
    frames,
    defaultLayout: validateFrameTree(definition.defaultLayout),
  };
}

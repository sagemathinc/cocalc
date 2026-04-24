import type { EditorExtensionDefinition } from "@cocalc/sdk";

import {
  NO_EXT_PREFIX,
  canonical_extension,
} from "@cocalc/frontend/file-associations";

import type {
  RegisteredExtension,
  ResolvedEditorExtension,
  ResolveEditorExtensionOptions,
} from "./types";

export function fileTypeKeysForEditorExtension(
  extension: EditorExtensionDefinition,
): string[] {
  const keys = new Set<string>();
  for (const ext of extension.extensions) {
    keys.add(canonical_extension(ext));
  }
  for (const filename of extension.filenames) {
    keys.add(`${NO_EXT_PREFIX}${filename.toLowerCase()}`);
  }
  return [...keys];
}

function sortCandidates(
  candidates: RegisteredExtension<EditorExtensionDefinition>[],
): RegisteredExtension<EditorExtensionDefinition>[] {
  return [...candidates].sort(
    (left, right) =>
      (right.definition.priority ?? 0) - (left.definition.priority ?? 0) ||
      right.registeredAt - left.registeredAt ||
      left.definition.id.localeCompare(right.definition.id),
  );
}

function findById(
  candidates: RegisteredExtension<EditorExtensionDefinition>[],
  id: string | undefined,
): RegisteredExtension<EditorExtensionDefinition> | undefined {
  if (id == null) {
    return;
  }
  return candidates.find((candidate) => candidate.definition.id === id);
}

export function resolveEditorExtension(
  candidates: RegisteredExtension<EditorExtensionDefinition>[],
  options: ResolveEditorExtensionOptions = {},
): ResolvedEditorExtension | undefined {
  if (candidates.length === 0) {
    return;
  }

  const explicit = findById(candidates, options.editorId);
  if (explicit != null) {
    return { extension: explicit, reason: "editorId" };
  }

  const user = findById(candidates, options.userEditorId);
  if (user != null) {
    return { extension: user, reason: "user" };
  }

  const project = findById(candidates, options.projectEditorId);
  if (project != null) {
    return { extension: project, reason: "project" };
  }

  const sorted = sortCandidates(candidates);
  const hasPriorityOverride = sorted.some(
    (candidate) => (candidate.definition.priority ?? 0) !== 0,
  );
  if (hasPriorityOverride) {
    return { extension: sorted[0], reason: "priority" };
  }

  const builtin = findById(candidates, options.builtinEditorId);
  if (builtin != null) {
    return { extension: builtin, reason: "builtin" };
  }

  return { extension: sorted[0], reason: "latest" };
}

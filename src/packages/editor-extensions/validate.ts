import type {
  CommandSet,
  CommandSetInput,
  ExtensionFrameDefinition,
  ExtensionFrameDefinitionInput,
  ExtensionFrameNode,
  ExtensionFrameTree,
  ExtensionSource,
  ExtensionTabsFrameNode,
} from "./types";

const NAMESPACED_ID =
  /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*(?:@[A-Za-z0-9._-]+)?$/;

function assertNonEmptyString(
  name: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertStringArray(
  name: string,
  value: unknown,
): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
}

export function validateNamespacedId(name: string, value: unknown): string {
  assertNonEmptyString(name, value);
  if (!NAMESPACED_ID.test(value)) {
    throw new Error(`${name} must be a namespaced id like "org/name"`);
  }
  return value;
}

export function normalizeExtensionSource(
  source: ExtensionSource | undefined,
): ExtensionSource {
  return source ?? "builtin";
}

export function normalizeCommandSet(
  commands: CommandSetInput | undefined,
): CommandSet | undefined {
  if (commands == null) {
    return;
  }
  if (Array.isArray(commands)) {
    const normalized: CommandSet = {};
    for (const command of commands) {
      assertNonEmptyString("command", command);
      normalized[command] = true;
    }
    return normalized;
  }
  return { ...(commands as CommandSet) };
}

export function normalizeExtensions(
  extensions: string[] | undefined,
): string[] {
  if (extensions == null) {
    return [];
  }
  assertStringArray("extensions", extensions);
  return [...new Set(extensions.map((ext) => ext.toLowerCase()))];
}

export function normalizeFilenames(filenames: string[] | undefined): string[] {
  if (filenames == null) {
    return [];
  }
  assertStringArray("filenames", filenames);
  return [...new Set(filenames)];
}

export function validateFrameTree(
  tree: ExtensionFrameTree | undefined,
): ExtensionFrameTree | undefined {
  if (tree == null) {
    return;
  }
  assertNonEmptyString("defaultLayout.type", tree.type);
  if (tree.type === "node") {
    const node = tree as ExtensionFrameNode;
    if (
      node.first == null &&
      node.second == null &&
      (node.children == null || node.children.length === 0)
    ) {
      throw new Error(
        "defaultLayout node entries must define first/second or children",
      );
    }
  } else if (tree.type === "tabs") {
    const tabs = tree as ExtensionTabsFrameNode;
    if ((tabs.children?.length ?? 0) === 0) {
      throw new Error("defaultLayout tabs entries must define children");
    }
  }
  return tree;
}

export function normalizeFrameDefinition(
  type: string,
  frame: ExtensionFrameDefinitionInput,
): ExtensionFrameDefinition {
  validateNamespacedId("frame type", type);
  assertNonEmptyString("frame.short", frame.short);
  assertNonEmptyString("frame.name", frame.name);
  if (frame.component == null) {
    throw new Error(`frame "${type}" must define a component`);
  }
  return {
    ...frame,
    type,
    commands: normalizeCommandSet(frame.commands),
    buttons: normalizeCommandSet(frame.buttons),
  };
}

import React from "react";
import type {
  EditorExtensionDefinition,
  ExtensionFrameDefinition,
  ExtensionFrameTree,
} from "@cocalc/editor-extensions";

import {
  isIconName,
  type IconName,
  type IconRef,
} from "@cocalc/frontend/components/icon";
import { exact_filename_key } from "@cocalc/frontend/file-associations";
import { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import { cm } from "@cocalc/frontend/frame-editors/code-editor/editor";
import {
  createEditor,
  type EditorProps,
} from "@cocalc/frontend/frame-editors/frame-tree/editor";
import { register_file_editor as registerFrameTreeEditor } from "@cocalc/frontend/frame-editors/frame-tree/register";
import type {
  EditorDescription,
  EditorSpec,
  FrameTree,
} from "@cocalc/frontend/frame-editors/frame-tree/types";
import { terminal } from "@cocalc/frontend/frame-editors/terminal-editor/editor";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";

import { extensionRegistry } from "./registry";

const NATIVE_EDITOR_FRAMES: Readonly<Record<string, EditorDescription>> = {
  cm,
  terminal,
  timetravel: time_travel,
};

interface ExtensionActionsClass {
  new (name: string, redux: any): CodeEditorActions;
}

function pickNamedExport<T>(value: unknown, names: string[]): T {
  if (value != null && typeof value === "object") {
    for (const name of names) {
      if ((value as Record<string, unknown>)[name] != null) {
        return (value as Record<string, T>)[name];
      }
    }
    if ((value as Record<string, unknown>).default != null) {
      return (value as Record<string, T>).default;
    }
  }
  return value as T;
}

function isActionsClass(value: unknown): value is ExtensionActionsClass {
  return (
    typeof value === "function" &&
    value.prototype != null &&
    typeof (value.prototype as { _init?: unknown })._init === "function"
  );
}

function isAsyncLoader(
  value: unknown,
): value is () => unknown | Promise<unknown> {
  if (typeof value !== "function" || isActionsClass(value)) {
    return false;
  }
  const proto = (value as { prototype?: { isReactComponent?: unknown } })
    .prototype;
  return proto?.isReactComponent !== true && value.length === 0;
}

async function resolveExtensionValue<T>(
  value: unknown,
  exportNames: string[],
): Promise<T> {
  let resolved = value;
  if (isAsyncLoader(value)) {
    resolved = await value();
  }
  return pickNamedExport<T>(resolved, exportNames);
}

function toEditorDescription(
  frame: ExtensionFrameDefinition,
): EditorDescription {
  const componentRef = frame.component;
  let component: EditorDescription["component"];

  if (isAsyncLoader(componentRef)) {
    component = async (props) => {
      const loaded = await resolveExtensionValue<any>(componentRef, [
        "component",
        "Component",
        "Editor",
      ]);
      if (typeof loaded === "function") {
        return React.createElement(loaded, props);
      }
      return loaded;
    };
  } else if (typeof componentRef === "function") {
    component = componentRef as EditorDescription["component"];
  } else {
    component = async () =>
      await resolveExtensionValue(componentRef, ["default"]);
  }

  return {
    type: frame.type,
    short: frame.short,
    name: frame.name,
    icon: (frame.icon ?? "file") as IconRef,
    component,
    commands: frame.commands,
    customizeCommands:
      frame.customizeCommands as EditorDescription["customizeCommands"],
    buttons: frame.buttons,
  };
}

function toEditorSpec(definition: EditorExtensionDefinition): EditorSpec {
  const native: EditorSpec = {};
  for (const type of definition.nativeFrames) {
    const spec = NATIVE_EDITOR_FRAMES[type];
    if (spec == null) {
      throw new Error(
        `Editor extension "${definition.id}" references unknown native frame "${type}"`,
      );
    }
    native[type] = spec;
  }
  return {
    ...native,
    ...Object.fromEntries(
      Object.entries(definition.frames).map(([type, frame]) => [
        type,
        toEditorDescription(frame),
      ]),
    ),
  };
}

function defaultFrameTree(definition: EditorExtensionDefinition): FrameTree {
  if (definition.defaultLayout != null) {
    return definition.defaultLayout as FrameTree;
  }
  const firstType = Object.keys(definition.frames)[0];
  if (firstType == null) {
    throw new Error(
      `Editor extension "${definition.id}" must define at least one frame`,
    );
  }
  return { type: firstType };
}

function synthesizeActions(
  definition: EditorExtensionDefinition,
): ExtensionActionsClass {
  const layout = defaultFrameTree(definition) as ExtensionFrameTree;
  const sync = definition.sync ?? { doctype: "none" as const };

  return class GeneratedExtensionActions extends CodeEditorActions {
    protected doctype = sync.doctype;
    protected primary_keys = sync.primaryKeys ?? [];
    protected string_cols = sync.stringCols ?? [];

    _raw_default_frame_tree(): FrameTree {
      return layout as FrameTree;
    }

    _init2(): void {
      if (sync.doctype === "syncstring") {
        this._init_syncstring_value();
      }
    }
  };
}

async function resolveActionsClass(
  definition: EditorExtensionDefinition,
): Promise<ExtensionActionsClass> {
  if (definition.actions == null) {
    return synthesizeActions(definition);
  }
  const resolved = await resolveExtensionValue<unknown>(definition.actions, [
    "Actions",
  ]);
  if (!isActionsClass(resolved)) {
    throw new Error(
      `Editor extension "${definition.id}" did not resolve to an Actions class`,
    );
  }
  return resolved;
}

function fileEditorIcon(
  definition: EditorExtensionDefinition,
): IconName | undefined {
  if (isIconName(definition.icon)) {
    return definition.icon;
  }
  for (const frame of Object.values(definition.frames)) {
    if (isIconName(frame.icon)) {
      return frame.icon;
    }
  }
  return undefined;
}

function extensionKeys(definition: EditorExtensionDefinition): string[] {
  return [
    ...definition.extensions,
    ...definition.filenames.map((filename) => exact_filename_key(filename)),
  ];
}

function registerEditorExtension(definition: EditorExtensionDefinition): void {
  registerFrameTreeEditor({
    id: definition.id,
    ext: extensionKeys(definition),
    icon: fileEditorIcon(definition),
    editor: async () => ({
      Editor: createEditor({
        display_name: definition.name,
        editor_spec: toEditorSpec(definition),
      }) as React.FC<EditorProps>,
    }),
    actions: async () => ({
      Actions: await resolveActionsClass(definition),
    }),
  });
}

let initialized = false;

export function initExtensionManifestRegistration(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  for (const { definition } of extensionRegistry.listRegistered()) {
    if (definition.kind === "editor") {
      registerEditorExtension(definition);
    }
  }

  extensionRegistry.subscribe(({ type, extension }) => {
    if (type !== "registered" || extension.definition.kind !== "editor") {
      return;
    }
    registerEditorExtension(extension.definition);
  });
}

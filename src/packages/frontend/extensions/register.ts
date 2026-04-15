import React from "react";
import type {
  EditorExtensionDefinition,
  ExtensionFrameDefinition,
  ExtensionFrameTree,
} from "@cocalc/editor-extensions";

import { ErrorDisplay, Loading } from "@cocalc/frontend/components";
import {
  isIconName,
  type IconName,
  type IconRef,
} from "@cocalc/frontend/components/icon";
import { exact_filename_key } from "@cocalc/frontend/file-associations";
import { register_file_editor as registerFrameTreeEditor } from "@cocalc/frontend/frame-editors/frame-tree/register";
import type {
  EditorComponentProps,
  EditorDescription,
  EditorSpec,
  FrameTree,
} from "@cocalc/frontend/frame-editors/frame-tree/types";

import { extensionRegistry } from "./registry";

interface ExtensionActionsClass {
  new (name: string, redux: any): any;
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
  if ((value as { $$typeof?: unknown }).$$typeof != null) {
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

const extensionValueLoadCache = new WeakMap<object, Promise<unknown>>();

function cachedResolveExtensionValue<T>(
  value: unknown,
  exportNames: string[],
): Promise<T> {
  if (
    value == null ||
    (typeof value !== "function" && typeof value !== "object")
  ) {
    return Promise.resolve(value as T);
  }
  const cacheKey = value as object;
  const cached = extensionValueLoadCache.get(cacheKey);
  if (cached != null) {
    return cached as Promise<T>;
  }
  const promise = resolveExtensionValue<T>(value, exportNames);
  extensionValueLoadCache.set(cacheKey, promise);
  return promise;
}

function isReactComponentObject(
  value: unknown,
): value is Exclude<React.ElementType, string> {
  return (
    value != null &&
    typeof value === "object" &&
    (value as { $$typeof?: unknown }).$$typeof != null
  );
}

function renderResolvedComponent(
  resolved: unknown,
  props: EditorComponentProps,
): React.ReactNode {
  if (React.isValidElement(resolved)) {
    return resolved;
  }
  if (typeof resolved === "function" || isReactComponentObject(resolved)) {
    const LoadedComponent = resolved as React.ElementType<EditorComponentProps>;
    return React.createElement(LoadedComponent, props);
  }
  return resolved as React.ReactNode;
}

function createDeferredComponent(
  componentRef: unknown,
  exportNames: string[],
): EditorDescription["component"] {
  const DeferredComponent: React.FC<EditorComponentProps> = (props) => {
    const [resolved, setResolved] = React.useState<unknown>();
    const [error, setError] = React.useState<string>();

    React.useEffect(() => {
      let active = true;
      cachedResolveExtensionValue(componentRef, exportNames)
        .then((value) => {
          if (!active) {
            return;
          }
          setResolved(value);
          setError(undefined);
        })
        .catch((err) => {
          if (!active) {
            return;
          }
          setError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        active = false;
      };
    }, []);

    if (error != null) {
      return React.createElement(ErrorDisplay, { error });
    }
    if (resolved == null) {
      return React.createElement(Loading, { theme: "medium" });
    }
    return React.createElement(
      React.Fragment,
      null,
      renderResolvedComponent(resolved, props),
    );
  };

  DeferredComponent.displayName = "DeferredExtensionComponent";
  return DeferredComponent;
}

function toEditorDescription(
  frame: ExtensionFrameDefinition,
): EditorDescription {
  const componentRef = frame.component;
  let component: EditorDescription["component"];

  if (typeof componentRef === "function") {
    component = componentRef as EditorDescription["component"];
  } else if (isReactComponentObject(componentRef)) {
    component = (props) =>
      React.createElement(
        componentRef as React.ElementType<EditorComponentProps>,
        props,
      );
  } else {
    component = createDeferredComponent(componentRef, [
      "component",
      "Component",
      "Editor",
      "default",
    ]);
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

async function getNativeEditorFrames(): Promise<
  Record<string, EditorDescription>
> {
  const [{ cm }, { terminal }, { time_travel }] = await Promise.all([
    import("@cocalc/frontend/frame-editors/code-editor/editor"),
    import("@cocalc/frontend/frame-editors/terminal-editor/editor"),
    import("@cocalc/frontend/frame-editors/time-travel-editor/editor"),
  ]);
  return {
    cm,
    terminal,
    timetravel: time_travel,
  };
}

async function toEditorSpec(
  definition: EditorExtensionDefinition,
): Promise<EditorSpec> {
  const nativeFrames = await getNativeEditorFrames();
  const native: EditorSpec = {};
  for (const type of definition.nativeFrames) {
    const spec = nativeFrames[type];
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
): Promise<ExtensionActionsClass> {
  const layout = defaultFrameTree(definition) as ExtensionFrameTree;
  const sync = definition.sync ?? { doctype: "none" as const };
  return import("@cocalc/frontend/frame-editors/code-editor/actions").then(
    ({ Actions: CodeEditorActions }) =>
      class GeneratedExtensionActions extends CodeEditorActions {
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
      },
  );
}

async function resolveActionsClass(
  definition: EditorExtensionDefinition,
): Promise<ExtensionActionsClass> {
  if (definition.actions == null) {
    return await synthesizeActions(definition);
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
    editor: async () => {
      const [{ createEditor }] = await Promise.all([
        import("@cocalc/frontend/frame-editors/frame-tree/editor"),
      ]);
      return {
        Editor: createEditor({
          display_name: definition.name,
          editor_spec: await toEditorSpec(definition),
        }) as React.FC<any>,
      };
    },
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

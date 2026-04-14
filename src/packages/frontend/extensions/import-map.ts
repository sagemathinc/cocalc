import React from "react";

type ExtensionImportProvider =
  | unknown
  | Promise<unknown>
  | (() => unknown | Promise<unknown>);

const EXTENSION_IMPORT_MAP_KEY = Symbol.for(
  "cocalc.editor-extensions.import-map",
);
const EXTENSION_IMPORT_CACHE_KEY = Symbol.for(
  "cocalc.editor-extensions.import-cache",
);

function getExtensionImportMapStore(): Map<string, ExtensionImportProvider> {
  const root = globalThis as Record<PropertyKey, unknown>;
  if (!(root[EXTENSION_IMPORT_MAP_KEY] instanceof Map)) {
    root[EXTENSION_IMPORT_MAP_KEY] = new Map<string, ExtensionImportProvider>();
  }
  return root[EXTENSION_IMPORT_MAP_KEY] as Map<string, ExtensionImportProvider>;
}

function getExtensionImportCacheStore(): Map<string, Promise<unknown>> {
  const root = globalThis as Record<PropertyKey, unknown>;
  if (!(root[EXTENSION_IMPORT_CACHE_KEY] instanceof Map)) {
    root[EXTENSION_IMPORT_CACHE_KEY] = new Map<string, Promise<unknown>>();
  }
  return root[EXTENSION_IMPORT_CACHE_KEY] as Map<string, Promise<unknown>>;
}

export type ExtensionImportValue = ExtensionImportProvider;

const BUILTIN_EXTENSION_IMPORTS: Record<string, ExtensionImportValue> = {
  react: React,
  "@cocalc/conat": () => import("./host-conat"),
  "@cocalc/editor-extensions": () => import("@cocalc/editor-extensions"),
  "@cocalc/frontend/app-framework": () =>
    import("@cocalc/frontend/app-framework"),
  "@cocalc/frontend/app-framework/syncdb": () =>
    import("@cocalc/frontend/app-framework/syncdb"),
  "@cocalc/frontend/extensions/hooks": () => import("./hooks"),
  "@cocalc/frontend/frame-editors/code-editor/actions": () =>
    import("@cocalc/frontend/frame-editors/code-editor/actions"),
  "@cocalc/frontend/frame-editors/code-editor/codemirror-editor": () =>
    import("@cocalc/frontend/frame-editors/code-editor/codemirror-editor"),
  "@cocalc/util": () => import("./host-util"),
};

export function setupExtensionImportMap(
  entries: Record<string, ExtensionImportValue>,
): void {
  const importMap = getExtensionImportMapStore();
  for (const [specifier, value] of Object.entries(entries)) {
    importMap.set(specifier, value);
    getExtensionImportCacheStore().delete(specifier);
  }
}

let extensionImportsInitialized = false;

export function initExtensionImportMap(): void {
  if (extensionImportsInitialized) {
    return;
  }
  extensionImportsInitialized = true;
  setupExtensionImportMap(BUILTIN_EXTENSION_IMPORTS);
}

export function hasExtensionImport(specifier: string): boolean {
  return getExtensionImportMapStore().has(specifier);
}

export function getExtensionImport(
  specifier: string,
): ExtensionImportValue | undefined {
  return getExtensionImportMapStore().get(specifier);
}

export async function loadExtensionImport(specifier: string): Promise<unknown> {
  const cached = getExtensionImportCacheStore().get(specifier);
  if (cached != null) {
    return await cached;
  }
  const value = getExtensionImport(specifier);
  if (value == null) {
    throw new Error(`Unknown extension import "${specifier}"`);
  }
  const promise = Promise.resolve(
    typeof value === "function"
      ? (value as () => unknown | Promise<unknown>)()
      : value,
  );
  getExtensionImportCacheStore().set(specifier, promise);
  try {
    return await promise;
  } catch (err) {
    getExtensionImportCacheStore().delete(specifier);
    throw err;
  }
}

export async function loadExtensionImports(
  specifiers: string[],
): Promise<Record<string, unknown>> {
  return Object.fromEntries(
    await Promise.all(
      specifiers.map(async (specifier) => [
        specifier,
        await loadExtensionImport(specifier),
      ]),
    ),
  );
}

export function listExtensionImports(): string[] {
  return [...getExtensionImportMapStore().keys()].sort();
}

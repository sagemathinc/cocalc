import type { ExtensionDefinition } from "@cocalc/editor-extensions";

import { extensionRegistry } from "./registry";
import {
  getExtensionImportModuleUrl,
  loadExtensionImport,
  loadExtensionImports,
  listExtensionImports,
} from "./import-map";

export interface LoadedExtensionBundle {
  bundleUrl: string;
  extension: ExtensionDefinition;
}

const bundleLoadCache = new Map<string, Promise<LoadedExtensionBundle>>();

export async function loadExtensionHostModule(
  specifier: string,
): Promise<unknown> {
  return await loadExtensionImport(specifier);
}

export async function loadExtensionHostModules(
  specifiers: string[],
): Promise<Record<string, unknown>> {
  return await loadExtensionImports(specifiers);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteSpecifier(
  source: string,
  specifier: string,
  replacement: string,
): string {
  const escaped = escapeRegExp(specifier);
  return source
    .replace(
      new RegExp(`(from\\s+["'])${escaped}(["'])`, "g"),
      `$1${replacement}$2`,
    )
    .replace(
      new RegExp(`(import\\s*\\(\\s*["'])${escaped}(["']\\s*\\))`, "g"),
      `$1${replacement}$2`,
    )
    .replace(
      new RegExp(`(export\\s+\\*\\s+from\\s+["'])${escaped}(["'])`, "g"),
      `$1${replacement}$2`,
    )
    .replace(
      new RegExp(
        `(export\\s+\\{[^}]+\\}\\s+from\\s+["'])${escaped}(["'])`,
        "g",
      ),
      `$1${replacement}$2`,
    );
}

async function rewriteExtensionBundleImports(source: string): Promise<string> {
  let rewritten = source;
  for (const specifier of listExtensionImports()) {
    const shimUrl = await getExtensionImportModuleUrl(specifier);
    rewritten = rewriteSpecifier(rewritten, specifier, shimUrl);
  }
  return rewritten;
}

function diffRegisteredExtensions(before: Map<string, number>) {
  return extensionRegistry
    .listRegistered()
    .filter(
      ({ definition, registeredAt }) =>
        before.get(definition.id) !== registeredAt,
    )
    .sort((left, right) => right.registeredAt - left.registeredAt);
}

export async function loadExtensionBundle(
  bundleUrl: string,
): Promise<LoadedExtensionBundle> {
  const cached = bundleLoadCache.get(bundleUrl);
  if (cached != null) {
    return await cached;
  }
  const promise = (async () => {
    const before = new Map(
      extensionRegistry
        .listRegistered()
        .map(({ definition, registeredAt }) => [definition.id, registeredAt]),
    );
    const response = await fetch(bundleUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to load extension bundle ${bundleUrl}: ${response.status} ${response.statusText}`,
      );
    }
    const source = await response.text();
    const rewritten = await rewriteExtensionBundleImports(source);
    const moduleUrl = URL.createObjectURL(
      new Blob([rewritten, `\n//# sourceURL=${JSON.stringify(bundleUrl)}\n`], {
        type: "text/javascript",
      }),
    );
    try {
      await import(/* webpackIgnore: true */ moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    const changed = diffRegisteredExtensions(before);
    const loaded = changed[0];
    if (loaded == null) {
      throw new Error(
        `Extension bundle ${bundleUrl} did not register an extension`,
      );
    }
    return { bundleUrl, extension: loaded.definition };
  })();
  bundleLoadCache.set(bundleUrl, promise);
  try {
    return await promise;
  } catch (err) {
    bundleLoadCache.delete(bundleUrl);
    throw err;
  }
}

export function registerLoadedExtension(extension: ExtensionDefinition): void {
  extensionRegistry.register(extension);
}

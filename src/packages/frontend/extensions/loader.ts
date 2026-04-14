import type { ExtensionDefinition } from "@cocalc/editor-extensions";

import { extensionRegistry } from "./registry";
import { loadExtensionImport, loadExtensionImports } from "./import-map";

export interface LoadedExtensionBundle {
  bundleUrl: string;
  extension: ExtensionDefinition;
}

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

export async function loadExtensionBundle(
  bundleUrl: string,
): Promise<LoadedExtensionBundle> {
  throw new Error(
    `Extension archive loading is not implemented yet for ${bundleUrl}`,
  );
}

export function registerLoadedExtension(extension: ExtensionDefinition): void {
  extensionRegistry.register(extension);
}

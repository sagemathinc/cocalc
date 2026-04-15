import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

import { loadExtensionBundle } from "./loader";

interface BuiltinExtensionArchive {
  id: string;
  version: string;
  filename: string;
  path: string;
}

interface BuiltinExtensionIndex {
  builtins?: BuiltinExtensionArchive[];
}

function builtinIndexUrl(): string {
  return `${appBasePath}/static/editor-extensions/index.json`;
}

function builtinArchiveUrl(path: string): string {
  return `${appBasePath}/static/${path}`;
}

export async function initBuiltinExtensionBundles(): Promise<void> {
  const response = await fetch(builtinIndexUrl());
  if (!response.ok) {
    if (response.status === 404) {
      return;
    }
    throw new Error(
      `Failed to load builtin extension index: ${response.status} ${response.statusText}`,
    );
  }
  const index = (await response.json()) as BuiltinExtensionIndex;
  for (const builtin of index.builtins ?? []) {
    await loadExtensionBundle(builtinArchiveUrl(builtin.path), {
      trust: "builtin",
    });
  }
}

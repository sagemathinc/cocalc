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

let builtinExtensionBundlesPromise: Promise<void> | undefined;

function builtinBasePath(): string {
  return appBasePath === "/" ? "" : appBasePath;
}

function builtinIndexUrl(): string {
  return `${builtinBasePath()}/static/editor-extensions/index.json`;
}

function builtinArchiveUrl(path: string): string {
  return `${builtinBasePath()}/static/${path}`;
}

async function loadBuiltinExtensionBundles(): Promise<void> {
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

export async function ensureBuiltinExtensionBundles(): Promise<void> {
  builtinExtensionBundlesPromise ??= loadBuiltinExtensionBundles();
  return await builtinExtensionBundlesPromise;
}

export async function initBuiltinExtensionBundles(): Promise<void> {
  await ensureBuiltinExtensionBundles();
}

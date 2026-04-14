import type { ExtensionDefinition, ExtensionRegistrationApi } from "./types";

const REGISTRATION_API_KEY = Symbol.for(
  "cocalc.editor-extensions.registration-api",
);
const PENDING_EXTENSIONS_KEY = Symbol.for(
  "cocalc.editor-extensions.pending-extensions",
);

function getPendingExtensions(): ExtensionDefinition[] {
  const root = globalThis as Record<PropertyKey, unknown>;
  if (!Array.isArray(root[PENDING_EXTENSIONS_KEY])) {
    root[PENDING_EXTENSIONS_KEY] = [];
  }
  return root[PENDING_EXTENSIONS_KEY] as ExtensionDefinition[];
}

export function getExtensionRegistrationApi():
  | ExtensionRegistrationApi
  | undefined {
  const root = globalThis as Record<PropertyKey, unknown>;
  return root[REGISTRATION_API_KEY] as ExtensionRegistrationApi | undefined;
}

export function setExtensionRegistrationApi(
  api: ExtensionRegistrationApi | undefined,
): void {
  const root = globalThis as Record<PropertyKey, unknown>;
  root[REGISTRATION_API_KEY] = api;
  if (api == null) {
    return;
  }
  consumePendingExtensions((extension) => {
    api.register(extension);
  });
}

export function consumePendingExtensions(
  register: (extension: ExtensionDefinition) => void,
): void {
  const pending = getPendingExtensions().splice(0);
  for (const extension of pending) {
    register(extension);
  }
}

export function registerExtension<T extends ExtensionDefinition>(
  extension: T,
): T {
  const api = getExtensionRegistrationApi();
  if (api != null) {
    api.register(extension);
  } else {
    getPendingExtensions().push(extension);
  }
  return extension;
}

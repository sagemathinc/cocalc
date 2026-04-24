declare var DEBUG: boolean;

import type { TrustedExtensionSupplier } from "@cocalc/sdk";

import { redux } from "@cocalc/frontend/app-framework";

const EXTENSION_TRUST_CONFIG_KEY = Symbol.for(
  "cocalc.sdk.trust-config",
);

interface ExtensionTrustConfig {
  allowUnsignedLocalhost?: boolean;
  trustedSuppliers?: TrustedExtensionSupplier[];
}

function getExtensionTrustConfigStore(): ExtensionTrustConfig {
  const root = globalThis as Record<PropertyKey, unknown>;
  if (
    root[EXTENSION_TRUST_CONFIG_KEY] == null ||
    typeof root[EXTENSION_TRUST_CONFIG_KEY] !== "object"
  ) {
    root[EXTENSION_TRUST_CONFIG_KEY] = {};
  }
  return root[EXTENSION_TRUST_CONFIG_KEY] as ExtensionTrustConfig;
}

function normalizeTrustedSuppliers(
  value: unknown,
): TrustedExtensionSupplier[] | undefined {
  if (value == null) {
    return;
  }
  const raw =
    typeof (value as { toJS?: unknown }).toJS === "function"
      ? (value as { toJS: () => unknown }).toJS()
      : value;
  if (!Array.isArray(raw)) {
    return;
  }
  return raw
    .filter(
      (supplier): supplier is Record<string, unknown> =>
        supplier != null &&
        typeof supplier === "object" &&
        !Array.isArray(supplier),
    )
    .map((supplier) => ({
      id: String(supplier.id ?? ""),
      name:
        typeof supplier.name === "string" && supplier.name !== ""
          ? supplier.name
          : undefined,
      publicKey: String(supplier.publicKey ?? ""),
      enabled: supplier.enabled !== false,
    }))
    .filter(({ id, publicKey }) => id !== "" && publicKey !== "");
}

function getConfiguredTrustedSuppliers(): TrustedExtensionSupplier[] {
  const configured = getExtensionTrustConfigStore().trustedSuppliers;
  if (configured != null) {
    return configured;
  }
  return (
    normalizeTrustedSuppliers(
      redux.getStore("customize")?.get?.("trusted_sdk_suppliers"),
    ) ?? []
  );
}

function getDeveloperModeFlag(): boolean {
  const accountStore = redux.getStore("account");
  return (
    accountStore?.getIn?.(["customize", "sdk_developer_mode"]) ===
      true || accountStore?.getIn?.(["customize", "developer_mode"]) === true
  );
}

function isLocalhostUrl(bundleUrl: string): boolean {
  try {
    const url = new URL(bundleUrl, globalThis.location?.href);
    return ["localhost", "127.0.0.1", "::1"].includes(
      url.hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

export function setupExtensionTrust(config: ExtensionTrustConfig): void {
  const store = getExtensionTrustConfigStore();
  if (config.allowUnsignedLocalhost != null) {
    store.allowUnsignedLocalhost = config.allowUnsignedLocalhost;
  }
  if (config.trustedSuppliers != null) {
    store.trustedSuppliers = [...config.trustedSuppliers];
  }
}

export function getTrustedExtensionSuppliers(): TrustedExtensionSupplier[] {
  return getConfiguredTrustedSuppliers();
}

export function shouldSkipExtensionSignatureVerification(
  bundleUrl: string,
): boolean {
  const store = getExtensionTrustConfigStore();
  const allowUnsignedLocalhost =
    (store.allowUnsignedLocalhost ?? DEBUG) || getDeveloperModeFlag();
  return allowUnsignedLocalhost && isLocalhostUrl(bundleUrl);
}

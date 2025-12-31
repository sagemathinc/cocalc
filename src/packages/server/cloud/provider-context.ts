import { type ProviderEntry, type ProviderId } from "@cocalc/cloud";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getControlPlaneSshKeypair } from "./ssh-key";
import { getServerProvider } from "./providers";

export type ProviderContext = {
  id: ProviderId;
  entry: ProviderEntry;
  creds: any;
  prefix?: string;
};

export async function getProviderContext(
  providerId: ProviderId,
): Promise<ProviderContext> {
  const provider = getServerProvider(providerId);
  if (!provider) {
    throw new Error(`unsupported cloud provider ${providerId}`);
  }
  const settings = await getServerSettings();
  const { publicKey: controlPlanePublicKey } =
    await getControlPlaneSshKeypair();
  const prefix = provider.getPrefix(settings);
  const creds = await provider.getCreds({
    settings,
    controlPlanePublicKey,
    prefix,
  });
  return { id: providerId, entry: provider.entry, creds, prefix };
}

export async function getProviderPrefix(
  providerId: ProviderId,
  settings?: Awaited<ReturnType<typeof getServerSettings>>,
): Promise<string> {
  const resolved = settings ?? (await getServerSettings());
  const provider = getServerProvider(providerId);
  if (!provider) return "cocalc-host";
  return provider.getPrefix(resolved);
}

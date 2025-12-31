import { SDK } from "@nebius/js-sdk";
import {
  DiskService,
  ImageService,
  InstanceService,
  PlatformService,
} from "@nebius/js-sdk/api/nebius/compute/v1/index";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("cloud:nebius:client");

let nebiusUnhandledRejectionInstalled = false;

function isNebiusAuthError(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  const message = reason.message ?? "";
  const stack = reason.stack ?? "";
  return (
    message.includes("DECODER routines::unsupported") ||
    stack.includes("@nebius/js-sdk") ||
    stack.includes("ServiceAccount.getExchangeTokenRequest")
  );
}

function installNebiusUnhandledRejectionHandler() {
  if (nebiusUnhandledRejectionInstalled) return;
  nebiusUnhandledRejectionInstalled = true;
  process.on("unhandledRejection", (reason) => {
    if (isNebiusAuthError(reason)) {
      // Nebius SDK can reject from a background token renewal; log and keep
      // running so a bad key doesn't take the whole hub down.
      logger.warn("nebius auth failure (ignored)", { err: reason });
      return;
    }
    throw reason;
  });
}
export type NebiusCreds = {
  serviceAccountId: string;
  publicKeyId: string;
  privateKeyPem: string;
  parentId: string;
};

export class NebiusClient {
  private sdk: SDK;
  readonly disks: DiskService;
  readonly instances: InstanceService;
  readonly images: ImageService;
  readonly platforms: PlatformService;

  constructor(creds: NebiusCreds) {
    installNebiusUnhandledRejectionHandler();
    this.sdk = new SDK({
      credentials: {
        serviceAccountId: creds.serviceAccountId,
        publicKeyId: creds.publicKeyId,
        privateKeyPem: creds.privateKeyPem,
      },
      parentId: creds.parentId,
    });
    this.disks = new DiskService(this.sdk);
    this.instances = new InstanceService(this.sdk);
    this.images = new ImageService(this.sdk);
    this.platforms = new PlatformService(this.sdk);
  }

  parentId(): string | undefined {
    return this.sdk.parentId();
  }
}

import { SDK } from "@nebius/js-sdk";
import {
  DiskService,
  ImageService,
  InstanceService,
  PlatformService,
} from "@nebius/js-sdk/api/nebius/compute/v1/index";
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

// On-prem: parsing and converting the quota.gpu information

import { SiteLicenseQuota } from "./site-licenses";

export const GPU_DEFAULT_RESOURCE = "nvidia.com/gpu"

export function extract_gpu(quota: SiteLicenseQuota = {}) {
  const { gpu } = quota;
  if (gpu == null) return { num: 0 };
  if (typeof gpu === "object") return gpu;
  return { num: 0 };
}

type GPUQuotaInfo = {
  resources?: {
    limits: {
      [resource: string]: number; // resource default: $GPU_DEFAULT_RESOURCE
    };
  };
  nodeSelector?: { [key: string]: string };
  tolerations?: (
    | {
        key: string;
        operator: string;
        value: string;
        effect: string;
      }
    | {
        key: string;
        operator: string;
        effect: string;
      }
  )[];
};

export function process_gpu_quota(quota: SiteLicenseQuota = {}): GPUQuotaInfo {
  const {
    num = 0,
    toleration = "",
    nodeLabel = "",
    resource = GPU_DEFAULT_RESOURCE,
  } = extract_gpu(quota);

  const info: GPUQuotaInfo = {};
  if (num > 0) {
    info.resources = { limits: { [resource]: num } };

    if (nodeLabel) {
      info.nodeSelector = {};
      for (const label of nodeLabel.split(",")) {
        const [key, val] = label.trim().split("=");
        info.nodeSelector[key] = val;
      }
    }

    if (toleration) {
      info.tolerations = [];
      for (const tol of toleration.split(",")) {
        const [key, val] = tol.trim().split("=");
        if (val) {
          info.tolerations.push({
            key,
            operator: "Equal",
            value: val,
            effect: "NoSchedule",
          });
        } else {
          info.tolerations.push({
            key,
            operator: "Exists",
            effect: "NoSchedule",
          });
        }
      }
    }
  }
  return info;
}

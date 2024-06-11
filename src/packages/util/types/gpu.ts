// On-prem: parsing and converting the quota.gpu information

import { SiteLicenseQuota } from "./site-licenses";

export function extract_gpu(quota: SiteLicenseQuota = {}) {
  const { gpu } = quota;
  if (gpu == null) return { num: 0 };
  if (typeof gpu === "object") return gpu;
  return { num: 0 };
}

type GPUQuotaInfo = {
  resources?: { limits: { "nvidia.com/gpu": number } };
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
  const { num = 0, toleration = "", nodeLabel = "" } = extract_gpu(quota);

  const debug: GPUQuotaInfo = {};
  if (num > 0) {
    debug.resources = { limits: { "nvidia.com/gpu": num } };
    if (nodeLabel) {
      debug.nodeSelector = {};
      for (const label of nodeLabel.split(",")) {
        const [key, val] = label.trim().split("=");
        debug.nodeSelector[key] = val;
      }
    }
    if (toleration) {
      debug.tolerations = [];
      for (const tol of toleration.split(",")) {
        const [key, val] = tol.trim().split("=");
        if (val) {
          debug.tolerations.push({
            key,
            operator: "Equal",
            value: val,
            effect: "NoSchedule",
          });
        } else {
          debug.tolerations.push({
            key,
            operator: "Exists",
            effect: "NoSchedule",
          });
        }
      }
    }
  }
  return debug;
}

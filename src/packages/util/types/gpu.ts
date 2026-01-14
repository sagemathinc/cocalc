// On-prem: parsing and converting GPU quota information.

export type GPU = {
  num?: number; // usually 1, 0 means "disabled"
  toleration?: string; // e.g. gpu=cocalc for key=value
  nodeLabel?: string; // e.g. gpu=cocalc for key=value
  resource?: string; // default: GPU_DEFAULT_RESOURCE
};

export const GPU_DEFAULT_RESOURCE = "nvidia.com/gpu";

export function extract_gpu(gpu?: GPU | boolean): GPU {
  if (gpu == null || gpu === false) return { num: 0 };
  if (gpu === true) return { num: 1 };
  return gpu;
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

export function process_gpu_quota(gpu?: GPU | boolean): GPUQuotaInfo {
  const {
    num = 0,
    toleration = "",
    nodeLabel = "",
    resource = GPU_DEFAULT_RESOURCE,
  } = extract_gpu(gpu);

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

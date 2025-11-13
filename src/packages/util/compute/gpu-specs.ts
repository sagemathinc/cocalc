// key specs of various NVidia GPUs -- useful to show to a user.

export interface Specs {
  // url of official datasheet pdf
  datasheet: string;
  // amount of GPU memory in GB
  memory: number;
  // memory bandwidth in GB/s
  memory_bw: number;
  // CUDA cores
  cuda_cores: number;
  // tensor cores
  tensor_cores: number;
}

export const GPU_SPECS = {
  "RTX-A4000": {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/gtcs21/rtx-a4000/nvidia-rtx-a4000-datasheet.pdf",
    hyperstack: "https://www.hyperstack.cloud/rtx-a4000",
    memory: 16,
    memory_bw: 448,
    cuda_cores: 6144,
    tensor_cores: 192,
  },
  "RTX-A5000": {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/gtcs21/rtx-a5000/nvidia-rtx-a5000-datasheet.pdf",
    hyperstack: "https://www.hyperstack.cloud/rtx-a5000",
    memory: 20,
    memory_bw: 640,
    cuda_cores: 7168,
    tensor_cores: 224,
  },
  "RTX-A6000": {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/proviz-print-nvidia-rtx-a6000-datasheet-us-nvidia-1454980-r9-web%20(1).pdf",
    hyperstack: "https://www.hyperstack.cloud/rtx-a6000",
    memory: 48,
    memory_bw: 768,
    cuda_cores: 10752,
    tensor_cores: 336,
  },
  "RTX-A6000-ada": {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/proviz-print-nvidia-rtx-a6000-datasheet-us-nvidia-1454980-r9-web%20(1).pdf",
    hyperstack: "https://www.hyperstack.cloud/rtx-a6000",
    memory: 48,
    memory_bw: 768,
    cuda_cores: 10752,
    tensor_cores: 336,
  },
  A10: {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a10/pdf/a10-datasheet.pdf",
    memory: 24,
    memory_bw: 600,
    cuda_cores: 9216,
    tensor_cores: 288,
  },
  A40: {
    datasheet:
      "https://images.nvidia.com/content/Solutions/data-center/a40/nvidia-a40-datasheet.pdf",
    memory: 48,
    memory_bw: 696,
    cuda_cores: 10752,
    tensor_cores: 336,
  },
  T4: {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-t4/t4-tensor-core-datasheet-951643.pdf",
    memory: 16,
    memory_bw: 300,
    cuda_cores: 2560,
    tensor_cores: 320,
  },
  L4: {
    datasheet:
      "https://resources.nvidia.com/en-us-data-center-overview-mc/en-us-data-center-overview/l4-gpu-datasheet",
    memory: 24,
    memory_bw: 300,
    cuda_cores: 7424,
    tensor_cores: 240,
  },
  L40: {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/support-guide/NVIDIA-L40-Datasheet-January-2023.pdf",
    hyperstack: "https://www.hyperstack.cloud/l40",
    memory: 48,
    memory_bw: 864,
    cuda_cores: 18176,
    tensor_cores: 568,
  },
  "A100-40GB-PCIe": {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf",
    memory: 40,
    memory_bw: 1555,
    cuda_cores: 6912,
    tensor_cores: 432,
  },
  "A100-80GB-PCIe": {
    datasheet:
      "https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf",
    hyperstack: "https://www.hyperstack.cloud/a100",
    memory: 80,
    memory_bw: 1935,
    cuda_cores: 6912,
    tensor_cores: 432,
  },
  "H100-80GB-PCIe": {
    datasheet:
      "https://resources.nvidia.com/en-us-tensor-core/nvidia-tensor-core-gpu-datasheet",
    hyperstack: "https://www.hyperstack.cloud/h100-pcie",
    memory: 80,
    memory_bw: 2000,
    cuda_cores: 14592,
    tensor_cores: 640,
  },
};

// map from Hyperstack GPU resource name to specs of that GPU

interface Specs {
  // amount of GPU memory in GB
  memory: number;
  // memory bandwidth in GB/s
  memory_bw: number;
  // CUDA cores
  cuda_cores: number;
  // tensor cores
  tensor_cores: number;
  // rt cores
  rt_cores: number;
  // single-precision tflops
  single_tflops: number;
  // RT Core performance
  rt_tflops: number;
  // Tensor performance
  tensor_tflops: number;
}

export const SPECS = {
  "RTX-A4000": {
    memory: 16,
    memory_bw: 448,
    cuda_cores: 6144,
    tensor_cores: 192,
    rt_cores: 48,
    single_tflops: 19.2,
    rt_tflops: 37.4,
    tensor_tflops: 153.4,
  },
  "RTX-A5000": {
    memory: 20,
    memory_bw: 640,
    cuda_cores: 7168,
    tensor_cores: 224,
    rt_cores: 56,
    single_tflops: 23.7,
    rt_tflops: 46.2,
    tensor_tflops: 189.2,
  },
  "RTX-A6000": {
    memory: 48,
    memory_bw: 768,
    cuda_cores: 10752,
    tensor_cores: 336,
    rt_cores: 84,
    single_tflops: 38.7,
    rt_tflops: 75.6,
    tensor_tflops: 309.7,
  },
  "RTX-A6000-ada": {
    memory: 48,
    memory_bw: 768,
    cuda_cores: 10752,
    tensor_cores: 336,
    rt_cores: 84,
    single_tflops: 38.7,
    rt_tflops: 75.6,
    tensor_tflops: 309.7,
  },
  A40: 0,
  L6000: 0,
  L40: 0,
  "L40-sm": 0,
  A100: 80,
  "A100-80G-PCIe": 80,
  "A100-80G-PCIe-NVLink": 80,
  "A100-80G-PCIe-sm": 80,
  H100: 80,
  "H100-80G-PCIe": 80,
  "H100-80G-PCIe-k8s": 80,
  "H100-80GB-PCIe-sm": 80,
  "H100-80G-PCIe-NVLink": 80,
};

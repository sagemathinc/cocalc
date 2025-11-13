export function displayAcceleratorType(acceleratorType, memory?) {
  let x = acceleratorType
    .replace("tesla-", "")
    .replace("nvidia-", "NVIDIA ")
    .replace("-", " - ")
    .toUpperCase();
  if (x.includes("GB") || !memory) {
    return x;
  }
  return `${x} - ${memory} GB`;
}

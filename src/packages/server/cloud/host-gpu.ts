import type { HostMachine } from "@cocalc/conat/hub/api/hosts";

export function machineHasGpu(machine?: HostMachine | null): boolean {
  if (!machine) return false;
  const gpuCount = machine.gpu_count ?? 0;
  return gpuCount > 0;
}

export function normalizeMachineGpuInPlace(
  machine: HostMachine,
  wantsGpu?: boolean,
): HostMachine {
  const gpuTypeRaw = String(machine.gpu_type ?? "").trim();
  const gpuType = gpuTypeRaw.toLowerCase();
  const gpuCount = machine.gpu_count ?? 0;
  const gpuEnabled =
    wantsGpu === true
      ? true
      : wantsGpu === false
        ? false
        : gpuCount > 0;

  if (!gpuEnabled) {
    delete machine.gpu_type;
    delete machine.gpu_count;
    return machine;
  }

  if (!gpuType || gpuType === "none") {
    delete machine.gpu_type;
  }
  if (!machine.gpu_count || machine.gpu_count <= 0) {
    machine.gpu_count = 1;
  }
  return machine;
}

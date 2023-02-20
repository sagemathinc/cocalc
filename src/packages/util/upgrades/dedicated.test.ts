/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  getDedicatedVMPrice,
  rawPrice2Retail,
  VMS,
  PRICES,
  SNAPSHOT_FACTOR,
} from "./dedicated";
const { disks: DISKS } = PRICES;

describe("check prices of some VMs", () => {
  it("test getDedicatedVMPrice", () => {
    const dediPrice = getDedicatedVMPrice({ mem: 16, cpu: 4, family: "n2" });
    // 141.79 from price calculator, no usage discount
    const expected = rawPrice2Retail(141.79, true);
    expect(dediPrice).toBeCloseTo(expected, 1);
  });

  it("n2 standard", () => {
    const vm = VMS["n2-standard-4"];
    if (!vm) throw Error("vm not found");
    expect(vm.spec.cpu).toBe(4);
    expect(vm.spec.mem).toBe(16 - 2);
    expect(vm.quota.dedicated_vm).toBe("n2-standard-4");
    const price = vm.price_day;
    expect(price).toBeCloseTo(rawPrice2Retail(141.79, true), 1);
  });

  it("n2 highmem", () => {
    const vm = VMS["n2-highmem-8"];
    if (!vm) throw Error("vm not found");
    expect(vm.spec.cpu).toBe(8);
    expect(vm.spec.mem).toBe(64 - 2);
    expect(vm.quota.dedicated_vm).toBe("n2-highmem-8");
    const price = vm.price_day;
    // 382.56 from https://cloud.google.com/products/calculator/#id=e29b7c1b-caec-4e5f-99cb-04124df38341
    expect(price).toBeCloseTo(rawPrice2Retail(382.56, true), 1);
  });

  it("c2 standard", () => {
    const vm1 = VMS["c2-standard-2"]; // does not exist!
    expect(vm1).toBeUndefined();
    const vm = VMS["c2-standard-4"];
    if (!vm) throw Error("vm not found");
    expect(vm.spec.cpu).toBe(4);
    expect(vm.spec.mem).toBe(16 - 2);
    expect(vm.quota.dedicated_vm).toBe("c2-standard-4");
    const price = vm.price_day;
    expect(price).toBeCloseTo(rawPrice2Retail(152.43, true), 1);
  });

  it("c2d standard", () => {
    const vm = VMS["c2d-standard-2"];
    if (!vm) throw Error("vm not found");
    const price = vm.price_day;
    expect(vm.spec.cpu).toBe(2);
    expect(vm.spec.mem).toBe(8 - 2);
    expect(vm.quota.dedicated_vm).toBe("c2d-standard-2");
    // false: no sustained use discount at all
    expect(price).toBeCloseTo(rawPrice2Retail(66.284, false), 1);
  });

  it("c2d highmem", () => {
    const vm = VMS["c2d-highmem-2"];
    if (!vm) throw Error("vm not found");
    const price = vm.price_day;
    expect(vm.spec.cpu).toBe(2);
    expect(vm.spec.mem).toBe(16 - 2);
    expect(vm.quota.dedicated_vm).toBe("c2d-highmem-2");
    // false: no sustained use discount at all
    // 89.40 from https://cloud.google.com/products/calculator/#id=77dce39c-186a-41d7-aedf-a00bd953875a
    expect(price).toBeCloseTo(rawPrice2Retail(89.4, false), 1);
  });
});

describe("check prices of some disks", () => {
  it("32 gb standard", () => {
    const disk = DISKS["32-standard"];
    if (!disk) throw Error("disk not found");
    expect(disk.quota.dedicated_disk.size_gb).toBe(32);
    expect(disk.quota.dedicated_disk.speed).toBe("standard");
    const price = disk.price_day;
    expect(price).toBeCloseTo(rawPrice2Retail(SNAPSHOT_FACTOR * 1.28), 1);
  });

  it("32 gb balanced", () => {
    const disk = DISKS["32-balanced"];
    if (!disk) throw Error("disk not found");
    expect(disk.quota.dedicated_disk.size_gb).toBe(32);
    expect(disk.quota.dedicated_disk.speed).toBe("balanced");
    const price = disk.price_day;
    expect(price).toBeCloseTo(rawPrice2Retail(SNAPSHOT_FACTOR * 3.2), 1);
  });

  it("32 gb ssd", () => {
    const disk = DISKS["32-ssd"];
    if (!disk) throw Error("disk not found");
    expect(disk.quota.dedicated_disk.size_gb).toBe(32);
    expect(disk.quota.dedicated_disk.speed).toBe("ssd");
    const price = disk.price_day;
    // 5.44 taken from https://cloud.google.com/products/calculator/#id=0b502591-e245-492c-8d55-65fd7877da2c
    expect(price).toBeCloseTo(rawPrice2Retail(SNAPSHOT_FACTOR * 5.44), 1);
  });
});

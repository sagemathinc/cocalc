import {
  get_kernel_data,
  get_kernel_data_by_name,
  getLanguage,
  getPythonKernelName,
} from "@cocalc/jupyter/kernel/kernel-data";

describe("basic consistency checks with getting kernels", () => {
  let kernels;
  it("gets the kernels", async () => {
    kernels = await get_kernel_data();
    expect(kernels.length).toBeGreaterThan(0);
  });

  it("for each kernel above, call get_kernel_data_by_name", async () => {
    for (const x of kernels) {
      const d = await get_kernel_data_by_name(x.name);
      expect(d).toEqual(x);
    }
  });

  it("for each kernel above, call getLanguage", async () => {
    for (const x of kernels) {
      await getLanguage(x.name);
    }
  });

  it("get a python kernel", async () => {
    await getPythonKernelName();
  });
});

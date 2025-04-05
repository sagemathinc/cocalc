/*
Return best(=biggest or svg) logo for the kernel, e.g.,

  {filename:"logo-svg.svg", base64:"base-64 version of logo-svg.svg"}.

Throws error if there is no logo for the given kernel.

If we get a logo successfully, we cache it for an hour, unless the noCache option is given.
*/

import { get_kernel_data } from "@cocalc/jupyter/kernel/kernel-data";
import { join } from "path";
import { readdir, readFile } from "fs/promises";
import LRU from "lru-cache";

interface Logo {
  filename: string;
  base64: string;
}

const cache = new LRU<string, Logo>({
  ttl: 60 * 60 * 1000,
  max: 30,
});

function getKernel(kernelData, name) {
  for (const k of kernelData) {
    if (k.name == name) {
      return k;
    }
  }
  return null;
}

export async function logo(
  kernelName: string,
  { noCache }: { noCache?: boolean } = {},
): Promise<Logo> {
  if (!noCache && cache.has(kernelName)) {
    return cache.get(kernelName)!;
  }
  const kernelData = await get_kernel_data({ noCache });

  const kernel = getKernel(kernelData, kernelName);
  if (kernel == null) {
    const msg = `no such kernel '${kernelName}'`;
    throw Error(msg);
  }
  const resource_dir = kernel.resource_dir;
  // get the files from resource_dir, which may include:
  //    logo-32x32.png  logo-64x64.png  logo-svg.svg
  // and sort in reverse alphabetical order and select first.
  // This gets 64x64 above 32x32 and 128x128 above 64x64, but
  // svg very first, since it's the best.

  // get the files from resource_dir
  const files = (await readdir(resource_dir)).filter((name) =>
    name.startsWith("logo-"),
  );

  // sort in reverse alphabetical order
  files.sort((a, b) => b.localeCompare(a));

  // select the first file
  const selectedFile = files[0];

  // Read the file and encode it in base64
  const filePath = join(resource_dir, selectedFile);
  const fileBuffer = await readFile(filePath);
  const base64 = fileBuffer.toString("base64");

  const x = { filename: selectedFile, base64 };
  cache.set(kernelName, x);
  return x;
}

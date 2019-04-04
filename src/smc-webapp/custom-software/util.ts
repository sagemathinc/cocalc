export const CUSTOM_IMG_PREFIX = "custom/";

export function compute_image2name(compute_image: string): string {
  const name = compute_image.slice(CUSTOM_IMG_PREFIX.length);
  return name.replace("/", ":");
}

export function compute_image2basename(compute_image: string): string {
  const name = compute_image.slice(CUSTOM_IMG_PREFIX.length);
  return name.split("/")[0];
}

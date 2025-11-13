// Return the default proxy.json config object for the given image.
// This uses the "defaults" image if proxy isn't explicitly defined.

export function defaultProxyConfig({ IMAGES, image }) {
  return IMAGES?.[image]?.proxy ?? IMAGES?.["defaults"]?.proxy ?? [];
}

let initialized = false;
export default async function getMermaid(): Promise<any> {
  const mermaid = (await import("mermaid")).default;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
    });
    initialized = true;
  }
  return mermaid;
}

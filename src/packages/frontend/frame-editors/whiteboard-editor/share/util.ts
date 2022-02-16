import { Element } from "../types";

export function parseSyncdbFile(content: string): Element[] {
  const elements: Element[] = [];
  for (const line of content.split("\n")) {
    try {
      const element = JSON.parse(line);
      elements.push(element);
    } catch (_err) {
      console.warn(`skipping invalid .board content -- "${line}"`);
    }
  }
  return elements;
}

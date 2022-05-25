export default function getSource({
  start,
  end,
  lines,
}: {
  start: number;
  end: number;
  lines: string[];
}): string {
  let markdown = "\n" + lines.slice(start, end).join("\n") + "\n";
  markdown = markdown.replace(/^\n/, "").replace(/\n+$/, "") + "\n\n";
  return markdown;
}

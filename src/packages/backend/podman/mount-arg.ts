
function escapeMountPath(p) {
  return p
    .replace(/\\/g, "\\\\") // literal backslashes
    .replace(/,/g, "\\,") // commas separate K/V pairs
    .replace(/=/g, "\\="); // equals separate keys from values
}

export default function mountArg({
  source,
  target,
  readOnly = false,
  options = "",
}: {
  source: string;
  target: string;
  readOnly?: boolean;
  options?: string;
}) {
  return `--mount=type=bind,source=${escapeMountPath(source)},target=${escapeMountPath(target)},${readOnly ? "ro" : "rw"}${options ? "," + options : ""}`;
}

import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { trunc } from "@cocalc/util/misc";

// we get about this many bytes of results from the filesystem, then stop...
const MAX_SIZE = 1_000_000;

const MAX_LINE_LENGTH = 256;

interface SearchResult {
  filename: string;
  description: string;
  line_number: number;
  filter: string;
}

export async function search({
  query,
  path,
  setState,
  fs,
  options = {},
}: {
  query: string;
  path: string;
  setState: (any) => void;
  fs: FilesystemClient;
  options: {
    case_sensitive?: boolean;
    git_grep?: boolean;
    subdirectories?: boolean;
    hidden_files?: boolean;
  };
}) {
  query = query?.trim()?.replace(/"/g, '\\"');
  if (!query) {
    return;
  }

  const rgOptions = ["--json"]; // note that -M doesn't seem to combine with --json, so can't do -M {MAX_LINE_LENGTH}
  if (!options.subdirectories) {
    rgOptions.push("-d", "1");
  }
  if (!options.case_sensitive) {
    rgOptions.push("-i");
  }
  if (options.hidden_files) {
    rgOptions.push("-.");
  }
  if (!options.git_grep) {
    rgOptions.push("--no-ignore");
  }

  const { stdout, truncated } = await fs.ripgrep(path, query, {
    options: rgOptions,
    maxSize: MAX_SIZE,
  });
  const lines = Buffer.from(stdout).toString().split("\n");

  const search_results: SearchResult[] = [];
  for (const line of lines) {
    let result;
    try {
      result = JSON.parse(line);
    } catch {
      continue;
    }
    if (result.type == "match") {
      const { line_number, lines, path } = result.data;
      const description = trunc(lines?.text ?? "", MAX_LINE_LENGTH);
      search_results.push({
        filename: path?.text ?? "-",
        description: `${(line_number.toString() + ":").padEnd(8, " ")}${description}`,
        filter: `${path?.text?.toLowerCase?.() ?? ""} ${description.toLowerCase()}`,
        line_number,
      });
    }
  }

  setState({
    too_many_results: truncated,
    search_results,
    most_recent_search: query,
    most_recent_path: path,
  });
}

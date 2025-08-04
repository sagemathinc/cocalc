import { type FilesystemClient } from "@cocalc/conat/files/fs";

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

  const rgOptions = ["--json", "-M", "256"];
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
    maxSize: 100_000,
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
      search_results.push({
        filename: path?.text ?? "-",
        description: `${(line_number.toString() + ":").padEnd(8, " ")}${lines.text}`,
        filter: `${path?.text?.toLowerCase?.() ?? ""} ${lines.text.toLowerCase()}`,
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

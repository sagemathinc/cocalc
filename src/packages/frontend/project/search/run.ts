import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { MARKERS } from "@cocalc/util/sagews";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export async function search({
  query,
  path,
  setState,
  fs: _fs,
  options = {},
  project_id,
  compute_server_id,
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
  project_id: string;
  compute_server_id: number;
}) {
  if (!query) {
    return;
  }

  query = query.trim().replace(/"/g, '\\"');
  if (query === "") {
    return;
  }
  const search_query = `"${query}"`;
  setState({
    search_results: undefined,
    search_error: undefined,
    most_recent_search: query,
    most_recent_path: path,
    too_many_results: false,
  });

  // generate the grep command for the given query with the given flags
  let cmd, ins;
  if (options.case_sensitive) {
    ins = "";
  } else {
    ins = " -i ";
  }

  if (options.git_grep) {
    let max_depth;
    if (options.subdirectories) {
      max_depth = "";
    } else {
      max_depth = "--max-depth=0";
    }
    // The || true is so that if git rev-parse has exit code 0,
    // but "git grep" finds nothing (hence has exit code 1), we don't
    // fall back to normal git (the other side of the ||). See
    //    https://github.com/sagemathinc/cocalc/issues/4276
    cmd = `git rev-parse --is-inside-work-tree && (git grep -n -I -H ${ins} ${max_depth} ${search_query} || true) || `;
  } else {
    cmd = "";
  }
  if (options.subdirectories) {
    if (options.hidden_files) {
      cmd += `rgrep -n -I -H --exclude-dir=.smc --exclude-dir=.snapshots ${ins} ${search_query} -- *`;
    } else {
      cmd += `rgrep -n -I -H --exclude-dir='.*' --exclude='.*' ${ins} ${search_query} -- *`;
    }
  } else {
    if (options.hidden_files) {
      cmd += `grep -n -I -H ${ins} ${search_query} -- .* *`;
    } else {
      cmd += `grep -n -I -H ${ins} ${search_query} -- *`;
    }
  }

  cmd += ` | grep -v ${MARKERS.cell}`;
  const max_results = 1000;
  const max_output = 110 * max_results; // just in case

  setState({
    command: cmd,
  });

  let output;
  try {
    output = await webapp_client.exec({
      project_id,
      command: cmd + " | cut -c 1-256", // truncate horizontal line length (imagine a binary file that is one very long line)
      timeout: 20, // how long grep runs on client
      max_output,
      bash: true,
      err_on_exit: true,
      compute_server_id,
      filesystem: true,
      path,
    });
  } catch (err) {
    processResults({ err, setState });
    return;
  }
  processResults({
    output,
    max_results,
    max_output,
    setState,
  });
}

function processResults({
  err,
  output,
  max_results,
  max_output,
  setState,
}: {
  err?;
  output?;
  max_results?;
  max_output?;
  setState;
}) {
  if (err) {
    err = `${err}`;
  }
  if ((err && output == null) || (output != null && output.stdout == null)) {
    setState({ search_error: err });
    return;
  }

  const results = output.stdout.split("\n");
  const too_many_results = !!(
    output.stdout.length >= max_output ||
    results.length > max_results ||
    err
  );
  let num_results = 0;
  const search_results: {}[] = [];
  for (const line of results) {
    if (line.trim() === "") {
      continue;
    }
    let i = line.indexOf(":");
    num_results += 1;
    if (i !== -1) {
      // all valid lines have a ':', the last line may have been truncated too early
      let filename = line.slice(0, i);
      if (filename.slice(0, 2) === "./") {
        filename = filename.slice(2);
      }
      let context = line.slice(i + 1);
      // strip codes in worksheet output
      if (context.length > 0 && context[0] === MARKERS.output) {
        i = context.slice(1).indexOf(MARKERS.output);
        context = context.slice(i + 2, context.length - 1);
      }

      const m = /^(\d+):/.exec(context);
      let line_number: number | undefined;
      if (m != null) {
        try {
          line_number = parseInt(m[1]);
        } catch (e) {}
      }

      search_results.push({
        filename,
        description: context,
        line_number,
        filter: `${filename.toLowerCase()} ${context.toLowerCase()}`,
      });
    }
    if (num_results >= max_results) {
      break;
    }
  }

  setState({
    too_many_results,
    search_results,
  });
}

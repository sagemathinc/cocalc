const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");

interface ParserOptions {
  parser: string;
  tabWidth: number;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

// ref: https://golang.org/cmd/gofmt/ ... but there isn't anything to configure

function run_gofmt(input_path: string) {
  const args = ["-w", input_path];
  return spawn("gofmt", args);
}

function cleanup_error(err: string, tmpfn: string): string {
  const ret: string[] = [];
  for (let line of err.split("\n")) {
    if (line.startsWith(tmpfn)) {
      line = line.slice(tmpfn.length + 1);
    }
    ret.push(line);
  }
  return ret.join("\n");
}

export async function gofmt(
  input: string,
  options: ParserOptions,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  try {
    // logger.debug(`gofmt tmp file: ${input_path}`);
    await callback(writeFile, input_path, input);

    // spawn the html formatter
    let formatter;

    switch (options.parser) {
      case "gofmt":
        formatter = run_gofmt(input_path /*, logger*/);
        break;
      default:
        throw Error(`Unknown Go code formatting utility '${options.parser}'`);
    }
    // stdout/err capture
    let stdout: string = "";
    let stderr: string = "";
    // read data as it is produced.
    formatter.stdout.on("data", data => (stdout += data.toString()));
    formatter.stderr.on("data", data => (stderr += data.toString()));
    // wait for subprocess to close.
    const code = await callback(close, formatter);
    if (code >= 1) {
      stdout = cleanup_error(stdout, input_path);
      stderr = cleanup_error(stderr, input_path);
      const err_msg = `Gofmt code formatting utility "${options.parser}" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`;
      logger.debug(`gofmt error: ${err_msg}`);
      throw Error(err_msg);
    }

    // all fine, we read from the temp file
    const output: Buffer = await callback(readFile, input_path);
    const s: string = output.toString("utf-8");
    // logger.debug(`gofmt_format output s ${s}`);

    return s;
  } finally {
    unlink(input_path, () => {});
  }
}

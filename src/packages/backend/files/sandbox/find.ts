import { spawn } from "node:child_process";

export default async function find(
  path: string,
  printf: string,
  timeout?: number,
): Promise<{
  // the output as a Buffer (not utf8, since it could have arbitrary file names!)
  stdout: Buffer;
  // truncated is true if the timeout gets hit.
  truncated: boolean;
}> {
  if (!path) {
    throw Error("path must be specified");
  }
  if (!printf) {
    throw Error("printf must be specified");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let truncated = false;

    const args = [
      "-P", // Never follow symlinks (security)
      path, // Search path
      "-maxdepth",
      "1",
      "-mindepth",
      "1",
      "-printf",
      printf,
    ];

    // Spawn find with minimal, fixed arguments
    const child = spawn("find", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {}, // Empty environment (security)
      shell: false, // No shell interpretation (security)
    });

    let timer;
    if (timeout) {
      timer = setTimeout(() => {
        if (!truncated) {
          truncated = true;
          child.kill("SIGTERM");
        }
      }, timeout);
    } else {
      timer = null;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Handle completion
    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });

    child.on("exit", (code) => {
      if (timer) {
        clearTimeout(timer);
      }

      if (code !== 0 && !truncated) {
        reject(new Error(`find exited with code ${code}: ${stderr}`));
        return;
      }

      resolve({ stdout: Buffer.concat(chunks), truncated });
    });
  });
}

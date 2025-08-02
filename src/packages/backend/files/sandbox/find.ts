import { spawn } from "node:child_process";
import type { FindOptions, FindExpression } from "@cocalc/conat/files/fs";
export type { FindOptions, FindExpression };

export default async function find(
  path: string,
  printf: string,
  { timeout = 0, recursive, expression }: FindOptions = {},
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
      "-mindepth",
      "1",
    ];
    if (!recursive) {
      args.push("-maxdepth", "1");
    }

    // Add expression if provided
    if (expression) {
      try {
        args.push(...buildFindArgs(expression));
      } catch (error) {
        reject(error);
        return;
      }
    }
    args.push("-printf", printf);

    //console.log(`find ${args.join(" ")}`);

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

function buildFindArgs(expr: FindExpression): string[] {
  switch (expr.type) {
    case "name":
      // Validate pattern has no path separators
      if (expr.pattern.includes("/")) {
        throw new Error("Path separators not allowed in name patterns");
      }
      return ["-name", expr.pattern];

    case "iname":
      if (expr.pattern.includes("/")) {
        throw new Error("Path separators not allowed in name patterns");
      }
      return ["-iname", expr.pattern];

    case "type":
      return ["-type", expr.value];

    case "size":
      // Validate size format (e.g., "10M", "1G", "500k")
      if (!/^[0-9]+[kMGTP]?$/.test(expr.value)) {
        throw new Error("Invalid size format");
      }
      return ["-size", expr.operator + expr.value];

    case "mtime":
      if (!Number.isInteger(expr.days) || expr.days < 0) {
        throw new Error("Invalid mtime days");
      }
      return ["-mtime", expr.operator + expr.days];

    case "newer":
      // This is risky - would need to validate file path is within sandbox
      if (expr.file.includes("..") || expr.file.startsWith("/")) {
        throw new Error("Invalid reference file path");
      }
      return ["-newer", expr.file];

    case "and":
      return [
        "(",
        ...buildFindArgs(expr.left),
        "-a",
        ...buildFindArgs(expr.right),
        ")",
      ];

    case "or":
      return [
        "(",
        ...buildFindArgs(expr.left),
        "-o",
        ...buildFindArgs(expr.right),
        ")",
      ];

    case "not":
      return ["!", ...buildFindArgs(expr.expr)];

    default:
      throw new Error("Unsupported expression type");
  }
}

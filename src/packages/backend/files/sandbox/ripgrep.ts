import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import * as path from "node:path";
import type { RipgrepOptions } from "@cocalc/conat/files/fs";
export type { RipgrepOptions };
import { rgPath } from "./install-ripgrep";

const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB limit

// Safely allowed options that don't pose security risks
const SAFE_OPTIONS = new Set([
  // Search behavior
  "--case-sensitive",
  "-s",
  "--ignore-case",
  "-i",
  "--word-regexp",
  "-w",
  "--line-number",
  "-n",
  "--count",
  "-c",
  "--files-with-matches",
  "-l",
  "--files-without-match",
  "--fixed-strings",
  "-F",
  "--invert-match",
  "-v",

  // Output format
  "--heading",
  "--no-heading",
  "--column",
  "--pretty",
  "--color",
  "--no-line-number",
  "-N",

  // Context lines (safe as long as we control the path)
  "--context",
  "-C",
  "--before-context",
  "-B",
  "--after-context",
  "-A",

  // Performance/filtering
  "--max-count",
  "-m",
  "--max-depth",
  "--max-filesize",
  "--type",
  "-t",
  "--type-not",
  "-T",
  "--glob",
  "-g",
  "--iglob",

  // File selection
  "--no-ignore",
  "--hidden",
  "--one-file-system",
  "--null-data",
  "--multiline",
  "-U",
  "--multiline-dotall",
  "--crlf",
  "--encoding",
  "-E",
  "--no-encoding",

  // basic info
  "--version",
]);

// Options that take values - need special validation
const OPTIONS_WITH_VALUES = new Set([
  "--max-count",
  "-m",
  "--max-depth",
  "--max-filesize",
  "--type",
  "-t",
  "--type-not",
  "-T",
  "--glob",
  "-g",
  "--iglob",
  "--context",
  "-C",
  "--before-context",
  "-B",
  "--after-context",
  "-A",
  "--encoding",
  "-E",
  "--color",
]);

interface ExtendedRipgrepOptions extends RipgrepOptions {
  options?: string[];
  allowedBasePath?: string; // The base path users are allowed to search within
}

function validateGlobPattern(pattern: string): boolean {
  // Reject patterns that could escape directory
  if (pattern.includes("../") || pattern.includes("..\\")) {
    return false;
  }
  // Reject absolute paths
  if (path.isAbsolute(pattern)) {
    return false;
  }
  return true;
}

function validateNumber(value: string): boolean {
  return /^\d+$/.test(value);
}

function validateEncoding(value: string): boolean {
  // Allow only safe encodings
  const safeEncodings = [
    "utf-8",
    "utf-16",
    "utf-16le",
    "utf-16be",
    "ascii",
    "latin-1",
  ];
  return safeEncodings.includes(value.toLowerCase());
}

function parseAndValidateOptions(options: string[]): string[] {
  const validatedOptions: string[] = [];
  let i = 0;

  while (i < options.length) {
    const opt = options[i];

    // Check if this is a safe option
    if (!SAFE_OPTIONS.has(opt)) {
      throw new Error(`Disallowed option: ${opt}`);
    }

    validatedOptions.push(opt);

    // Handle options that take values
    if (OPTIONS_WITH_VALUES.has(opt)) {
      i++;
      if (i >= options.length) {
        throw new Error(`Option ${opt} requires a value`);
      }

      const value = options[i];

      // Validate based on option type
      if (opt === "--glob" || opt === "-g" || opt === "--iglob") {
        if (!validateGlobPattern(value)) {
          throw new Error(`Invalid glob pattern: ${value}`);
        }
      } else if (
        opt === "--max-count" ||
        opt === "-m" ||
        opt === "--max-depth" ||
        opt === "--context" ||
        opt === "-C" ||
        opt === "--before-context" ||
        opt === "-B" ||
        opt === "--after-context" ||
        opt === "-A"
      ) {
        if (!validateNumber(value)) {
          throw new Error(`Invalid number for ${opt}: ${value}`);
        }
      } else if (opt === "--encoding" || opt === "-E") {
        if (!validateEncoding(value)) {
          throw new Error(`Invalid encoding: ${value}`);
        }
      } else if (opt === "--color") {
        if (!["never", "auto", "always", "ansi"].includes(value)) {
          throw new Error(`Invalid color option: ${value}`);
        }
      }
      validatedOptions.push(value);
    }
    i++;
  }
  return validatedOptions;
}

export default async function ripgrep(
  searchPath: string,
  regexp: string,
  { timeout = 0, options = [], allowedBasePath }: ExtendedRipgrepOptions = {},
): Promise<{
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
  truncated: boolean;
}> {
  if (searchPath == null) {
    throw Error("path must be specified");
  }
  if (regexp == null) {
    throw Error("regexp must be specified");
  }

  // Validate and normalize the search path
  let normalizedPath: string;
  try {
    // Resolve to real path (follows symlinks to get actual path)
    normalizedPath = await realpath(searchPath);
  } catch (err) {
    // If path doesn't exist, use normalize to check it
    normalizedPath = path.normalize(searchPath);
  }

  // Security check: ensure path is within allowed base path
  if (allowedBasePath) {
    const normalizedBase = await realpath(allowedBasePath);
    const relative = path.relative(normalizedBase, normalizedPath);

    // If relative path starts with .. or is absolute, it's outside allowed path
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Search path is outside allowed directory");
    }
  }

  // Validate regexp doesn't contain null bytes (command injection protection)
  if (regexp.includes("\0")) {
    throw new Error("Invalid regexp: contains null bytes");
  }

  // Build arguments array with security flags first
  const args = [
    "--no-follow", // Don't follow symlinks
    "--no-config", // Ignore config files
    "--no-ignore-global", // Don't use global gitignore
    "--no-require-git", // Don't require git repo
    "--no-messages", // Suppress error messages that might leak info
  ];

  // Add validated user options
  if (options.length > 0) {
    const validatedOptions = parseAndValidateOptions(options);
    args.push(...validatedOptions);
  }

  // Add the search pattern and path last
  args.push("--", regexp, normalizedPath); // -- prevents regexp from being treated as option

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let truncated = false;
    let stdoutSize = 0;
    let stderrSize = 0;

    const child = spawn(rgPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        // Minimal environment - only what ripgrep needs
        PATH: process.env.PATH,
        HOME: "/tmp", // Prevent access to user's home
        RIPGREP_CONFIG_PATH: "/dev/null", // Explicitly disable config
      },
      cwd: allowedBasePath || process.cwd(), // Restrict working directory
    });

    let timeoutHandle: NodeJS.Timeout | null = null;

    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        truncated = true;
        child.kill("SIGTERM");
        // Force kill after grace period
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1000);
      }, timeout);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_OUTPUT_SIZE) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stderrSize > MAX_OUTPUT_SIZE) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);

      // Truncate output if it's too large
      const finalStdout =
        stdout.length > MAX_OUTPUT_SIZE
          ? stdout.slice(0, MAX_OUTPUT_SIZE)
          : stdout;
      const finalStderr =
        stderr.length > MAX_OUTPUT_SIZE
          ? stderr.slice(0, MAX_OUTPUT_SIZE)
          : stderr;

      resolve({
        stdout: finalStdout,
        stderr: finalStderr,
        code,
        truncated,
      });
    });
  });
}

// Export utility functions for testing
export const _internal = {
  validateGlobPattern,
  validateNumber,
  validateEncoding,
  parseAndValidateOptions,
};

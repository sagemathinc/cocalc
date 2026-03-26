/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Client-side bridge SDK for apps running inside the .ai iframe.

This script is injected into the iframe's index.html (via a <script> tag
the agent adds). It creates `window.cocalc` with methods to interact
with the CoCalc project.

All communication happens via postMessage to the parent frame.
*/

/**
 * Returns the bridge SDK source code as a string, suitable for
 * injection into an HTML page as an inline <script>.
 *
 * The generated JS defines `window.cocalc` with the full API.
 */
export function getBridgeSDKSource(): string {
  return BRIDGE_SDK_SOURCE;
}

/**
 * Write the bridge SDK file to the app directory.  Non-fatal —
 * the bridge is optional, so errors are silently swallowed.
 */
export async function ensureBridgeSDK(
  project_id: string,
  bridgePath: string,
): Promise<void> {
  try {
    const { webapp_client } = await import("@cocalc/frontend/webapp-client");
    await webapp_client.project_client.writeFile({
      project_id,
      path: bridgePath,
      content: BRIDGE_SDK_SOURCE,
    });
  } catch {
    // non-fatal — the bridge is optional
  }
}

// The SDK is kept as a string constant so it can be injected into
// the iframe's HTML. It's plain ES2020 JS (no TS, no imports).
const BRIDGE_SDK_SOURCE = `
(function() {
  "use strict";

  // Pending request callbacks: id -> { resolve, reject }
  var pending = {};
  var idCounter = 0;

  function genId() {
    return "br_" + (++idCounter) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // Listen for responses from the parent
  window.addEventListener("message", function(event) {
    var data = event.data;
    if (!data || data.type !== "bridge-response") return;
    var cb = pending[data.id];
    if (!cb) return;
    delete pending[data.id];
    if (data.error) {
      cb.reject(new Error(data.error));
    } else {
      cb.resolve(data.result);
    }
  });

  function request(type, params) {
    return new Promise(function(resolve, reject) {
      var id = genId();
      pending[id] = { resolve: resolve, reject: reject };

      // Timeout after 5 minutes
      setTimeout(function() {
        if (pending[id]) {
          delete pending[id];
          reject(new Error("Bridge request timed out: " + type));
        }
      }, 300000);

      var req = Object.assign({ type: type, id: id }, params || {});
      window.parent.postMessage({ type: "cocalc-bridge-request", request: req }, "*");
    });
  }

  /**
   * CoCalc App Bridge API
   *
   * Available as window.cocalc in apps running inside the .ai editor.
   */
  window.cocalc = {
    /**
     * Check connectivity with the parent.
     * @returns {Promise<{pong: boolean, timestamp: number}>}
     */
    ping: function() {
      return request("ping");
    },

    /**
     * Execute a shell command in the project.
     * @param {string} command - The command to run
     * @param {string[]} [args] - Command arguments
     * @param {Object} [opts] - Options: timeout (seconds), path (working dir)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    exec: function(command, args, opts) {
      return request("exec", Object.assign(
        { command: command, args: args },
        opts || {}
      ));
    },

    /**
     * Read a file from the project.
     * @param {string} path - File path (relative to project root)
     * @returns {Promise<{content: string}>}
     */
    readFile: function(path) {
      return request("readFile", { path: path });
    },

    /**
     * Write a file to the project.
     * @param {string} path - File path
     * @param {string} content - File content
     * @returns {Promise<{ok: boolean}>}
     */
    writeFile: function(path, content) {
      return request("writeFile", { path: path, content: content });
    },

    /**
     * Delete a file from the project.
     * @param {string} path - File path
     * @returns {Promise<{ok: boolean}>}
     */
    deleteFile: function(path) {
      return request("deleteFile", { path: path });
    },

    /**
     * List files in a directory.
     * @param {string} path - Directory path
     * @param {Object} [opts] - Options: hidden (boolean)
     * @returns {Promise<{files: Array}>}
     */
    listFiles: function(path, opts) {
      return request("listFiles", Object.assign({ path: path }, opts || {}));
    },

    /**
     * Get a value from the app's key-value store.
     * @param {string} key
     * @returns {Promise<{value: any}>}
     */
    kvGet: function(key) {
      return request("kvGet", { key: key });
    },

    /**
     * Set a value in the app's key-value store.
     * @param {string} key
     * @param {*} value - Must be JSON-serializable
     * @returns {Promise<{ok: boolean}>}
     */
    kvSet: function(key, value) {
      return request("kvSet", { key: key, value: value });
    },

    /**
     * Delete a key from the app's key-value store.
     * @param {string} key
     * @returns {Promise<{ok: boolean}>}
     */
    kvDelete: function(key) {
      return request("kvDelete", { key: key });
    },

    /**
     * Get all key-value pairs.
     * @returns {Promise<{data: Object}>}
     */
    kvGetAll: function() {
      return request("kvGetAll");
    },

    /**
     * Run code in a given language. Supports: python, R, julia, node,
     * ruby, perl, bash, sh, octave, sage.
     * @param {string} lang - Language name (case-insensitive)
     * @param {string} code - Code to execute
     * @param {Object} [opts] - Options: timeout (seconds), path (working dir)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    run: function(lang, code, opts) {
      var langMap = {
        python: { cmd: "python3", flag: "-c" },
        python3: { cmd: "python3", flag: "-c" },
        r: { cmd: "Rscript", flag: "-e" },
        julia: { cmd: "julia", flag: "-e" },
        node: { cmd: "node", flag: "-e" },
        ruby: { cmd: "ruby", flag: "-e" },
        perl: { cmd: "perl", flag: "-e" },
        bash: { cmd: "bash", flag: "-c" },
        sh: { cmd: "sh", flag: "-c" },
        octave: { cmd: "octave", flag: "--eval" },
        sage: { cmd: "sage", flag: "-c" }
      };
      var entry = langMap[(lang || "").toLowerCase()];
      if (!entry) {
        return Promise.reject(new Error("Unknown language: " + lang +
          ". Supported: " + Object.keys(langMap).join(", ")));
      }
      return request("exec", Object.assign(
        { command: entry.cmd, args: [entry.flag, code] },
        opts || {}
      ));
    },

    /**
     * Run a Python script in the project and return its output.
     * Convenience wrapper around exec.
     * @param {string} code - Python code to execute
     * @param {Object} [opts] - Options: timeout (seconds)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    python: function(code, opts) {
      return request("exec", Object.assign(
        { command: "python3", args: ["-c", code] },
        opts || {}
      ));
    },

    /**
     * Run R code via Rscript.
     * @param {string} code - R code to execute
     * @param {Object} [opts] - Options: timeout (seconds), path (working dir)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    R: function(code, opts) {
      return request("exec", Object.assign(
        { command: "Rscript", args: ["-e", code] },
        opts || {}
      ));
    },

    /**
     * Run Julia code.
     * @param {string} code - Julia code to execute
     * @param {Object} [opts] - Options: timeout (seconds), path (working dir)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    julia: function(code, opts) {
      return request("exec", Object.assign(
        { command: "julia", args: ["-e", code] },
        opts || {}
      ));
    },

    /**
     * Run make with optional target and args.
     * @param {string} [target] - Make target (default: runs default target)
     * @param {Object} [opts] - Options: timeout (seconds), path (working dir), args (extra args)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    make: function(target, opts) {
      var args = [];
      if (target) args.push(target);
      if (opts && opts.args) args = args.concat(opts.args);
      return request("exec", Object.assign(
        { command: "make", args: args },
        opts || {},
        { args: args }
      ));
    },

    /**
     * Run latexmk on a LaTeX file.
     * @param {string} file - The .tex file to compile
     * @param {Object} [opts] - Options: timeout, path, args (extra latexmk flags)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    latexmk: function(file, opts) {
      var args = ["-pdf"];
      if (opts && opts.args) args = args.concat(opts.args);
      args.push(file);
      return request("exec", Object.assign(
        { command: "latexmk", args: args },
        opts || {},
        { args: args }
      ));
    },

    /**
     * Compile C/C++ code with gcc/g++.
     * @param {string[]} files - Source files to compile
     * @param {Object} [opts] - Options: timeout, path, output (output file), compiler ("gcc" or "g++"), args (extra flags)
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    gcc: function(files, opts) {
      opts = opts || {};
      var compiler = opts.compiler || "gcc";
      var args = (files || []).slice();
      if (opts.output) { args.push("-o"); args.push(opts.output); }
      if (opts.args) args = args.concat(opts.args);
      return request("exec", Object.assign(
        { command: compiler, args: args },
        opts,
        { args: args }
      ));
    },

    /**
     * UV-based Python environment management.
     * Manages a local virtual environment in the app directory.
     */
    uv: {
      /**
       * Initialize a uv Python project in the app directory.
       * Creates pyproject.toml and .venv if they don't exist.
       * @param {Object} [opts] - Options: pythonVersion (e.g. "3.12"), timeout
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      init: function(opts) {
        opts = opts || {};
        var args = ["init", "--no-workspace"];
        if (opts.pythonVersion) { args.push("--python"); args.push(opts.pythonVersion); }
        return request("exec", Object.assign(
          { command: "uv", args: args },
          { timeout: opts.timeout || 60 }
        ));
      },

      /**
       * Add packages to the uv environment.
       * @param {string|string[]} packages - Package name(s) to install
       * @param {Object} [opts] - Options: timeout
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      add: function(packages, opts) {
        opts = opts || {};
        var pkgs = typeof packages === "string" ? packages.split(/\s+/) : packages;
        var args = ["add"].concat(pkgs);
        return request("exec", Object.assign(
          { command: "uv", args: args },
          { timeout: opts.timeout || 120 }
        ));
      },

      /**
       * Remove packages from the uv environment.
       * @param {string|string[]} packages - Package name(s) to remove
       * @param {Object} [opts] - Options: timeout
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      remove: function(packages, opts) {
        opts = opts || {};
        var pkgs = typeof packages === "string" ? packages.split(/\s+/) : packages;
        var args = ["remove"].concat(pkgs);
        return request("exec", Object.assign(
          { command: "uv", args: args },
          { timeout: opts.timeout || 60 }
        ));
      },

      /**
       * Sync the uv environment (install all declared dependencies).
       * @param {Object} [opts] - Options: timeout
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      sync: function(opts) {
        opts = opts || {};
        return request("exec", Object.assign(
          { command: "uv", args: ["sync"] },
          { timeout: opts.timeout || 120 }
        ));
      },

      /**
       * Run Python code using the uv-managed environment.
       * Equivalent to: uv run python -c "code"
       * @param {string} code - Python code to execute
       * @param {Object} [opts] - Options: timeout (seconds)
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      run: function(code, opts) {
        return request("exec", Object.assign(
          { command: "uv", args: ["run", "python", "-c", code] },
          opts || {}
        ));
      },

      /**
       * Run a Python script file using the uv-managed environment.
       * Equivalent to: uv run python script.py [args...]
       * @param {string} script - Path to the Python script
       * @param {string[]} [args] - Script arguments
       * @param {Object} [opts] - Options: timeout (seconds)
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      runScript: function(script, args, opts) {
        var cmdArgs = ["run", "python", script].concat(args || []);
        return request("exec", Object.assign(
          { command: "uv", args: cmdArgs },
          opts || {}
        ));
      },

      /**
       * Run an arbitrary command in the uv environment.
       * Equivalent to: uv run <command> [args...]
       * @param {string} command - Command to run
       * @param {string[]} [args] - Command arguments
       * @param {Object} [opts] - Options: timeout (seconds)
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      exec: function(command, args, opts) {
        var cmdArgs = ["run", command].concat(args || []);
        return request("exec", Object.assign(
          { command: "uv", args: cmdArgs },
          opts || {}
        ));
      },

      /**
       * Install pip packages into the uv environment (without adding to pyproject.toml).
       * Equivalent to: uv pip install <packages>
       * @param {string|string[]} packages - Package name(s)
       * @param {Object} [opts] - Options: timeout
       * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
       */
      pip: function(packages, opts) {
        opts = opts || {};
        var pkgs = typeof packages === "string" ? packages.split(/\s+/) : packages;
        var args = ["pip", "install"].concat(pkgs);
        return request("exec", Object.assign(
          { command: "uv", args: args },
          { timeout: opts.timeout || 120 }
        ));
      }
    },

    /**
     * Get a URL via the CoCalc port proxy (transparent, preserves path).
     * @param {number} port - The port number
     * @returns {string} The proxied URL path
     */
    portURL: function(port) {
      var pid = window.cocalc._projectId || "";
      var base = window.cocalc._basePath || "";
      return base + "/" + pid + "/port/" + port + "/";
    },

    /**
     * Get a URL via the CoCalc server proxy (rewrites path to /).
     * Use this for Flask/Dash/FastAPI/etc. servers that expect
     * requests at their root path.
     * @param {number} port - The port number
     * @returns {string} The proxied URL path
     */
    serverURL: function(port) {
      var pid = window.cocalc._projectId || "";
      var base = window.cocalc._basePath || "";
      return base + "/" + pid + "/server/" + port + "/";
    },

    /**
     * Register a callback that fires when the app becomes visible
     * (e.g., user switches to the tab containing this app).
     * Multiple callbacks can be registered; they are called in order.
     * @param {Function} callback - Called with no arguments
     */
    onShow: function(callback) {
      if (typeof callback === "function") window.cocalc._showCallbacks.push(callback);
    },

    /**
     * Register a callback that fires when the app becomes hidden
     * (e.g., user switches to a different tab).
     * Multiple callbacks can be registered; they are called in order.
     * @param {Function} callback - Called with no arguments
     */
    onHide: function(callback) {
      if (typeof callback === "function") window.cocalc._hideCallbacks.push(callback);
    },

    // Internal: set by parent on init
    _projectId: "",
    _basePath: "",
    _showCallbacks: [],
    _hideCallbacks: []
  };

  // Listen for visibility push messages from parent
  window.addEventListener("message", function(event) {
    var data = event.data;
    if (!data) return;
    if (data.type === "cocalc-bridge-show") {
      window.cocalc._showCallbacks.forEach(function(cb) {
        try { cb(); } catch(e) { console.error("onShow callback error:", e); }
      });
    } else if (data.type === "cocalc-bridge-hide") {
      window.cocalc._hideCallbacks.forEach(function(cb) {
        try { cb(); } catch(e) { console.error("onHide callback error:", e); }
      });
    }
  });

  // Error capture: report uncaught errors and unhandled rejections to parent
  var errorBuffer = [];
  var errorFlushTimer = null;

  function flushErrors() {
    if (errorBuffer.length === 0) return;
    var errors = errorBuffer.slice();
    errorBuffer = [];
    errorFlushTimer = null;
    window.parent.postMessage({
      type: "cocalc-bridge-errors",
      errors: errors
    }, "*");
  }

  function captureError(info) {
    errorBuffer.push(info);
    if (!errorFlushTimer) {
      errorFlushTimer = setTimeout(flushErrors, 200);
    }
  }

  window.onerror = function(message, source, lineno, colno) {
    captureError({
      type: "error",
      message: String(message),
      source: source || "",
      line: lineno,
      col: colno
    });
  };

  window.addEventListener("unhandledrejection", function(event) {
    captureError({
      type: "unhandledrejection",
      message: event.reason ? String(event.reason.message || event.reason) : "Unhandled promise rejection"
    });
  });

  // Intercept console.error to capture logged errors
  var origConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    captureError({
      type: "console.error",
      message: args.map(function(a) {
        return typeof a === "object" ? JSON.stringify(a) : String(a);
      }).join(" ")
    });
    origConsoleError.apply(console, arguments);
  };

  // Notify parent that bridge is ready
  window.parent.postMessage({ type: "cocalc-bridge-ready" }, "*");

  // Listen for init message from parent
  window.addEventListener("message", function(event) {
    var data = event.data;
    if (data && data.type === "cocalc-bridge-init") {
      window.cocalc._projectId = data.projectId || "";
      window.cocalc._basePath = data.basePath || "";
    }
  });
})();
`;

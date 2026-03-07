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
     * Open a URL via the CoCalc port proxy.
     * Useful for apps that start a server on a specific port.
     * @param {number} port - The port number
     * @returns {string} The proxied URL path
     */
    portURL: function(port) {
      // The parent will inject projectId on init
      var pid = window.cocalc._projectId || "";
      var base = window.cocalc._basePath || "";
      return base + "/" + pid + "/port/" + port + "/";
    },

    // Internal: set by parent on init
    _projectId: "",
    _basePath: ""
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

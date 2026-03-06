/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Abstract base class shared by R Markdown and Quarto editor actions.
*/

import { Set } from "immutable";
import { debounce, type DebouncedFunc } from "lodash";

import { randomId } from "@cocalc/conat/names";
import { type AccountStore } from "@cocalc/frontend/account";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { exec, ExecOutput, server_time } from "../generic/client";
import { BuildCoordinator } from "../generic/build-coordinator";
import { Actions as MarkdownActions } from "../markdown-editor/actions";
import { checkProducedFiles } from "./utils";

export abstract class MarkdownConverterActions extends MarkdownActions {
  protected _last_hash: number | undefined = undefined;
  protected is_building: boolean = false;
  protected run_converter!: DebouncedFunc<(hash?: number) => Promise<void>>;
  protected buildCoordinator?: BuildCoordinator;
  private _lastBuiltHash?: number;
  private _buildWasStopped = false;

  // Subclasses provide the format-specific build logic and empty-file template.
  protected abstract _run_converter(hash?: number): Promise<void>;
  protected abstract get minimal_template(): string;

  protected do_build_on_save(): boolean {
    const account: AccountStore = this.redux.getStore("account");
    // Default to false until account settings are fully loaded to avoid
    // triggering builds before we know the user's preference.  The store
    // is initialized with schema defaults (build_on_save: true) before
    // is_ready fires, so checking editor_settings != null is not enough.
    if (!account?.get("is_ready")) return false;
    const settings = account.get("editor_settings");
    if (settings == null) return false;
    return settings.get("build_on_save") ?? true;
  }

  protected _init_converter(): void {
    // one build takes min. a few seconds up to a minute or more
    this.run_converter = debounce(
      async (hash?) => await this._run_converter(hash),
      5 * 1000,
      { leading: true, trailing: false },
    );

    const do_build = reuseInFlight(async () => {
      // do_build_on_save() returns false when editor_settings is null
      // (account not loaded yet), so early events are safely no-ops.
      // Once settings load, it returns the user's actual preference.
      if (!this.do_build_on_save()) return;
      if (this._syncstring == null) return;
      const hash = this._syncstring.hash_of_saved_version();
      if (this._last_hash != hash) {
        this._last_hash = hash;
        await this.build();
      }
    });

    // Register listeners for build-on-save. These fire on ALL clients
    // (including collaborators), which is intentional — builds are
    // collaborative and all clients should see build output.
    this._syncstring.on("save-to-disk", do_build);
    this._syncstring.on("after-change", do_build);

    // Wait for account settings, seed _last_hash, then optionally auto-build.
    void (async () => {
      const account: AccountStore = this.redux.getStore("account");
      if (!account) return;
      const ready = await account.waitUntilReady();
      if (this._state === "closed") return;
      if (this._syncstring == null) return;

      // Seed _last_hash so the next after-change doesn't treat the
      // already-open file as "changed" on the first keystroke.
      this._last_hash = this._syncstring.hash_of_saved_version();
      if (!ready) return; // timed out — settings not loaded, skip auto-build

      // Initial build: only if build_on_save enabled and no output exists yet.
      if (!this.do_build_on_save()) return;
      const outputs = await this._check_produced_files();
      if (this._state === "closed") return;
      if (this._syncstring == null) return; // closed between awaits
      // Re-seed in case time passed during _check_produced_files.
      this._last_hash = this._syncstring.hash_of_saved_version();
      if (outputs === null) return; // listing unavailable => skip
      if (outputs.size > 0) return; // output already exists => skip
      await this.build();
    })();

    this._init_build_coordinator();
  }

  private _init_build_coordinator(): void {
    this.buildCoordinator = new BuildCoordinator(this.project_id, this.path, {
      join: async (aggregate, _force) => {
        await this._run_converter(aggregate);
      },
      stop: () => this.stop_build(""),
      isBuilding: () => this.is_building,
      setBuilding: (v) => {
        this.is_building = v;
        this.setState({ building: v });
        if (!v && !this._buildWasStopped) {
          // A joined build just completed — track the hash so subsequent
          // no-op builds are skipped (same as originator's build path).
          this._lastBuiltHash = this._syncstring?.hash_of_saved_version();
        }
      },
      setError: (err) => this.set_error(err),
    });
  }

  async build(id?: string, force: boolean = false): Promise<void> {
    if (id) {
      const cm = this._get_cm(id);
      if (cm) {
        cm.focus();
      }
    }
    // initiating a build. if one is running & forced, we stop the build
    if (this.is_building) {
      if (force) {
        await this.stop_build("");
      } else {
        return;
      }
    }
    const actions = this.redux.getEditorActions(this.project_id, this.path);
    if (actions == null) {
      // opening/close a newly created file can trigger build when actions aren't
      // ready yet.  https://github.com/sagemathinc/cocalc/issues/7249
      return;
    }
    const buildId = randomId();
    this.is_building = true;
    this._buildWasStopped = false;
    this.buildCoordinator?.setLocalBuildId(buildId);
    this.setState({ building: true });
    try {
      await (actions as BaseActions<CodeEditorState>).save(false);
      const hash = force
        ? server_time().valueOf()
        : (this._syncstring?.hash_of_saved_version() ?? 0);
      // Skip if hash hasn't changed since last completed build — avoids DKV
      // chatter that causes other clients to flicker their build spinner.
      // Must be AFTER save so hash_of_saved_version() reflects pending edits.
      if (
        !force &&
        this._lastBuiltHash != null &&
        hash === this._lastBuiltHash
      ) {
        return; // finally block cleans up is_building / building state
      }
      this.buildCoordinator?.publishBuildStart(buildId, hash, force);
      // For force builds, bypass the debounced function to ensure immediate execution
      if (force) {
        await this._run_converter(hash);
      } else {
        await this.run_converter(hash);
      }
      if (!this._buildWasStopped) {
        this._lastBuiltHash = this._syncstring?.hash_of_saved_version() ?? hash;
      }
    } finally {
      this.buildCoordinator?.publishBuildFinished(buildId);
      this.is_building = false;
      this.setState({ building: false });
    }
  }

  // supports the "Force Rebuild" button.
  async force_build(id: string): Promise<void> {
    await this.build(id, true);
  }

  // Stops the current build process and resets state.
  async stop_build(_id: string): Promise<void> {
    this.buildCoordinator?.requestStop();
    // A stopped build didn't complete — clear the "last built" hash so
    // the next build isn't skipped as a no-op.
    this._lastBuiltHash = undefined;
    this._buildWasStopped = true;
    // Reset the debounce so the next build fires immediately instead of
    // being swallowed by the 5-second leading-edge window.
    this.run_converter?.cancel();
    const job_info = this.store.get("job_info")?.toJS() as
      | ExecuteCodeOutputAsync
      | undefined;

    if (
      job_info &&
      job_info.type === "async" &&
      job_info.status === "running" &&
      typeof job_info.pid === "number"
    ) {
      try {
        // Kill the process using the same approach as LaTeX editor
        await exec(
          {
            project_id: this.project_id,
            // negative PID, to kill the entire process group
            command: `kill -9 -${job_info.pid}`,
            // bash:true is necessary. kill + array does not work.
            bash: true,
            err_on_exit: false,
          },
          this.path,
        );
      } catch (err) {
        // likely "No such process", we just ignore it
      } finally {
        // Update the job status to killed
        const updated_job_info: ExecuteCodeOutputAsync = {
          ...job_info,
          status: "killed",
        };
        this.setState({ job_info: updated_job_info });
      }
    }
    this.set_status("");
    this.is_building = false;
    this.setState({ building: false });
  }

  async _check_produced_files(): Promise<Set<string> | null> {
    const result = await checkProducedFiles(this.project_id, this.path);
    if (result != null) {
      this.setState({ derived_file_types: result as any });
    }
    return result;
  }

  protected set_log(output?: ExecOutput | undefined): void {
    this.setState({
      build_err: output?.stderr?.trim(),
      build_log: output?.stdout?.trim(),
      build_exit: output?.exit_code,
      job_info: output?.type === "async" ? output : undefined,
    });
  }

  protected set_job_info(job_info: ExecuteCodeOutputAsync): void {
    if (!job_info) return;
    this.setState({
      build_log: (job_info.stdout ?? "").toString().trim(),
      build_err: (job_info.stderr ?? "").toString().trim(),
      build_exit: job_info.exit_code,
      job_info,
    });
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm",
        },
        second: {
          type: "node",
          direction: "row",
          first: { type: "iframe" },
          second: { type: "build" },
          pos: 0.8,
        },
      };
    }
  }

  reload(_id?: string, hash?: number) {
    // what is id supposed to be used for?
    // the html editor, which also has an iframe, calls somehow super.reload
    hash = hash || Date.now();
    ["iframe", "pdfjs_canvas", "markdown"].forEach((viewer) =>
      this.set_reload(viewer, hash),
    );
  }

  close(): void {
    this.buildCoordinator?.close();
    super.close();
  }

  // Never delete trailing whitespace for markdown files.
  delete_trailing_whitespace(): void {}

  protected ensureNonempty() {
    if (this.store && !this.store.get("value")?.trim()) {
      this.set_value(this.minimal_template);
      this.build();
    }
  }
}

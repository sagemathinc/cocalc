import SyncClient from "@cocalc/sync-client";
import { meta_file } from "@cocalc/util/misc";
import { initJupyterRedux } from "@cocalc/jupyter/kernel";
import { redux } from "@cocalc/jupyter/redux/app";
import getLogger from "@cocalc/backend/logger";
import { COMPUTE_THRESH_MS } from "@cocalc/jupyter/redux/project-actions";
import { project } from "@cocalc/api-client";
import { isValidUUID } from "@cocalc/util/misc";

const logger = getLogger("compute:jupyter");

// path should be something like "foo/bar.ipynb"
export function jupyter({
  path,
  project_id = process.env.PROJECT_ID ?? "",
  cwd,
  client,
}: {
  path: string;
  project_id?: string;
  cwd?: string;
  client?;
}) {
  const log = (...args) => logger.debug(path, ...args);
  log();
  if (cwd != null) {
    process.chdir(cwd);
  }
  if (!isValidUUID(project_id)) {
    throw Error(
      "specify the project id or set the PROJECT_ID env variable; it must be a valid uuid",
    );
  }
  const syncdb_path = meta_file(path, "jupyter2");
  client = client ?? new SyncClient({ project_id });

  // Calling the api-client ping will start the project *and* ensure
  // there is a hub connected to it, so we can initialize sync, and
  // the project can store data longterm in the database.
  project.ping({ project_id });

  // [ ] TODO: we need to listen for syncdb.error event,
  // and if that happens reset syncdb, but do NOT get
  // rid of jupyter kernel.  But really... we should maybe
  // make sure that syncdb error events don't happen.
  // Current issue is when hub gets restarted and there is no
  // tcp connection from hub to project, which causes error.

  const syncdb = client.sync_client.sync_db({
    project_id,
    path: syncdb_path,
    change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
    patch_interval: 50,
    primary_keys: ["type", "id"],
    string_cols: ["input"],
    cursors: false,
    persistent: true,
  });

  const init = () => {
    const f = () => {
      syncdb.set({
        type: "compute",
        id: client.client_id(),
        time: Date.now(),
      });
      syncdb.commit();
    };
    const i = setInterval(f, COMPUTE_THRESH_MS / 2);
    f();
    syncdb.once("closed", () => {
      clearInterval(i);
    });
  };

  if (syncdb.get_state() == "init") {
    syncdb.once("ready", init);
  } else {
    init();
  }

  log("initializing jupyter notebook redux...");
  initJupyterRedux(syncdb, client);
  const actions = redux.getEditorActions(project_id, path);
  const store = redux.getEditorStore(project_id, path);

  // keep project alive.
  // TODO: I'm concerned that this sort of api call
  // will round robbin across all next servers, and they all end up
  // connected to the project as a result.  Maybe that isn't so bad?
  setInterval(async () => {
    await project.ping({ project_id });
  }, 60000);

  const close = () => {
    syncdb.set({
      type: "compute",
      id: client.client_id(),
      time: 0,
    });
    syncdb.commit();
    syncdb.close();
  };

  return { syncdb, client, actions, store, redux, close };
}

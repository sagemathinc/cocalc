import { isValidUUID } from "@cocalc/util/misc";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

// This limit is because there is a limit on
// the length authentication protocol message, which is what we use to send the list of projects.
// This limit is the max_control_line (see https://docs.nats.io/running-a-nats-service/configuration)
// By default it is 4KB, which supports about 50 projects.  We increase it in the server
// to 32KB and allow up to 250 projects, which is way more than enough (oldest projects are
// automatically removed as needed).
const MAX_PROJECT_PERMISSIONS = 250;
const NORMAL_PROJECT_PERMISSIONS = 25;
const CUTOFF = 1000 * 60 * 60 * 24 * 7; // 1 week ago

// For dev/testing -- uncomment these to cause chaos as you click to open projects
// and close them and if you open several at once there's no permissions.  then
// test that things don't crash, but just keep trying, properly.
// const MAX_PROJECT_PERMISSIONS = 4;
// const NORMAL_PROJECT_PERMISSIONS = 1;
// const CUTOFF = 1000 * 30;

type NatsProjectCache = { [project_id: string]: number };

const localStorageKey = `${appBasePath}-nats-projects`;
console.log(localStorageKey);

let cache: NatsProjectPermissionsCache | null = null;
export function getPermissionsCache() {
  if (cache == null) {
    cache = new NatsProjectPermissionsCache();
  }
  return cache;
}

export class NatsProjectPermissionsCache {
  cache: NatsProjectCache;

  constructor() {
    this.cache = this.loadCache();
  }

  add = (project_ids: string[]) => {
    for (const project_id of project_ids) {
      if (!isValidUUID(project_id)) {
        throw Error(`invalid project_id -- ${project_id}`);
      }
      this.cache[project_id] = Date.now();
    }
    this.enforceLimits();
    this.saveCache();
  };

  get = () => {
    return Object.keys(this.cache).sort();
  };

  set = (project_ids: string[]) => {
    this.cache = {};
    const now = Date.now();
    for (const project_id of project_ids) {
      this.cache[project_id] = now;
    }
    this.enforceLimits();
    this.saveCache();
  };

  private enforceLimits = () => {
    const k = Object.keys(this.cache);
    if (k.length <= NORMAL_PROJECT_PERMISSIONS) {
      return;
    }
    let n = k.length;
    const cutoff = new Date(Date.now() - CUTOFF).valueOf();
    for (const project_id in this.cache) {
      if (this.cache[project_id] <= cutoff) {
        delete this.cache[project_id];
        n -= 1;
        if (n <= NORMAL_PROJECT_PERMISSIONS) {
          return;
        }
      }
    }
    if (n > MAX_PROJECT_PERMISSIONS) {
      const v = Object.values(this.cache);
      v.sort();
      const c = v.slice(-MAX_PROJECT_PERMISSIONS)[0];
      if (c != null) {
        for (const project_id in this.cache) {
          if (this.cache[project_id] <= c) {
            delete this.cache[project_id];
            n -= 1;
            if (n <= MAX_PROJECT_PERMISSIONS) {
              return;
            }
          }
        }
      }
    }
  };

  private saveCache = () => {
    localStorage[localStorageKey] = JSON.stringify(this.cache);
  };

  private loadCache = (): NatsProjectCache => {
    const s = localStorage[localStorageKey];
    if (!s) {
      return {};
    }
    // don't trust s at all;
    try {
      const a = JSON.parse(s) as any;
      const cache: NatsProjectCache = {};
      for (const project_id in a) {
        if (isValidUUID(project_id)) {
          cache[project_id] = parseInt(a[project_id]);
        }
      }
      return cache;
    } catch (err) {
      console.log("warning: ", err);
      return {};
    }
  };
}

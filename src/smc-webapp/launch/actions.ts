/*
Launch actions are certain "intentions" for specific actions,
which are triggered upon launching the webapp.

The automate a sequence of steps, possibly with some logic.

Motivating example number 1: a URL pointing to /app has a query parameter
that encodes a custom software image. The launch action creates a new
project with that software environment, or – in case there is already
a project with that environment, because the user comes back again
via the same link – presents that project to open up.

A similar example is crating a new project with the files from a
specific "share" on the share server.   This is for implementing
the "Open in CoCalc" link on the share server, with minimal friction.
*/

import { redux, Actions, Store } from "../app-framework";
import * as LS from "../misc/local-storage";
import { QueryParams } from "../misc/query-params";
import { launch_share } from "./share";
import { launch_custom_software_image } from "./custom-image";
import { launch_binder } from "./binder";

export const NAME = "launch-actions";
const LS_KEY = NAME;

type LaunchTypes = "csi" | "share" | "binder" | undefined;

interface LaunchData {
  launch?: string;
  type?: LaunchTypes;
  filepath?: string;
  urlpath?: string;
}

class LaunchActionsStore extends Store<LaunchData> {}

class LaunchActions<LaunchData> extends Actions<LaunchData> {}

redux.createStore<LaunchData, LaunchActionsStore>(NAME, LaunchActionsStore, {});
const actions = redux.createActions(NAME, LaunchActions);

// persist any launch action information in local storage (e.g. it's lost via SSO)
export function store() {
  const params = QueryParams.get_all();
  // console.log("launch-actions: params =", params);
  const launch = params.launch;
  if (launch === undefined) return;
  try {
    if (typeof launch !== "string") {
      console.warn("WARNING: launch query param must be a string");
      return;
    }
    const type = launch.split("/")[0] as LaunchTypes;
    const data: LaunchData = {
      launch,
      type,
    };
    {
      const filepath = params.filepath;
      if (filepath != null && typeof filepath === "string") {
        data.filepath = filepath;
      }
    }
    {
      const urlpath = params.urlpath;
      if (urlpath != null && typeof urlpath === "string") {
        data.urlpath = urlpath;
      }
    }
    LS.set(LS_KEY, data);
    actions.setState(data);
  } finally {
    // Remove the launch parameters from the URL, since they are now known (in localStorage) and
    // we don't want to repeat them any time the user refreshes their browser, etc.
    QueryParams.remove(["launch", "filepath", "urlpath"]);
  }
}

export function launch() {
  const data: LaunchData | undefined = LS.del<LaunchData>(LS_KEY);
  // console.log("launch-actions data=", data);
  if (data == null) return;
  const { type, launch } = data;
  if (launch == null || type == null || typeof launch != "string") {
    // nothing we can do with this.
    return;
  }
  actions.setState(data);
  try {
    switch (type) {
      case "binder":
        launch_binder(launch, data.filepath, data.urlpath);
        return;
      case "csi":
        launch_custom_software_image(launch);
        return;
      case "share":
        launch_share(launch);
        return;
      default:
        console.warn(`launch type "${type}" unknown`);
        return;
    }
  } catch (err) {
    console.warn(
      `WARNING: launch action "${launch}" of type "${type}" failed -- ${err}`
    );
  }
}

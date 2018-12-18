const misc = require("smc-util/misc");
let { webapp_client } = require("../webapp_client");
import { Actions, Store } from "../app-framework";
import { TypedMap } from "../app-framework/TypedMap";
import { List } from "immutable";

export interface ClusterState {
  id?: string;
  name?: string;
  error?: string;
}

export interface ICluster {
  id: string; // we store the ID and everything else in the DB
}

export class ClusterActions extends Actions<ClusterState> {
  private project_id: string;
  public syncdb: any;
  public store: Store<ClusterState>;

  _init = (project_id: string): void => {
    this.project_id = project_id;
    // be explicit about exactly what state is in the store
    this.setState({
      id: undefined,
      name: undefined
    });
  };

  init_error = (err): void => {
    this.setState({
      error: err
    });
  };

  _syncdb_change = (): void => {
    console.log(`Cluster/Actions: syncdb.get:`, this.syncdb.get());
    const data = this.syncdb.get();
    if (data.size >= 1) {
      this.setState({ id: data.getIn([0, "id"]) });
    }
  };

  _set = (obj: ICluster): void => {
    this.syncdb.set(obj);
    this.syncdb.save(); // save to file on disk
  };

  create_cluster = (): void => {
    this._set({ id: misc.uuid() });
  };
}

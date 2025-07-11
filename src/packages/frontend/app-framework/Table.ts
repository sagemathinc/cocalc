/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { AppRedux } from "../app-framework";
import { bind_methods } from "@cocalc/util/misc";
import { webapp_client } from "../webapp-client";

export type TableConstructor<T extends Table> = new (name, redux) => T;

export abstract class Table {
  public name: string;
  public _table: any;
  protected redux: AppRedux;

  // override in derived class to pass in options to the query -- these only impact initial query, not changefeed!
  options(): any[] {
    return [];
  }

  abstract query(): void;

  protected abstract _change(table: any, keys: string[]): void;

  protected no_changefeed(): boolean {
    return false;
  }

  constructor(name, redux) {
    bind_methods(this);
    this.name = name;
    this.redux = redux;
    if (this.no_changefeed()) {
      // Create the table but with no changefeed.
      this._table = webapp_client.sync_client.synctable_no_changefeed(
        this.query(),
        this.options(),
      );
    } else {
      // Set up a changefeed
      this._table = webapp_client.sync_client.sync_table(
        this.query(),
        this.options(),
      );
    }

    this._table.on("error", (error) => {
      console.warn(`Synctable error (table='${name}'):`, error);
    });

    if (this._change != null) {
      // Call the _change method whenever there is a change.
      this._table.on("change", (keys) => {
        this._change(this._table, keys);
      });
    }
  }

  close = () => {
    this._table.close();
  };

  set = async (
    changes: object,
    merge?: "deep" | "shallow" | "none", // The actual default is "deep" (see @cocalc/sync/table/synctable.ts)
    cb?: (error?: string) => void,
  ): Promise<void> => {
    if (cb == null) {
      // No callback, so let async/await report errors.
      // Do not let the error silently hide (like using the code below did)!!
      // We were missing  lot of bugs because of this...
      this._table.set(changes, merge);
      await this._table.save();
      return;
    }

    // callback is defined still.
    let e: undefined | string = undefined;
    try {
      this._table.set(changes, merge);
      await this._table.save();
    } catch (err) {
      e = err.toString();
    }
    cb(e);
  };
}

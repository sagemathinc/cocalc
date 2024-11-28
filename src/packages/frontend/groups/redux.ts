/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework/Table";
import { redux, Store, Actions } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isValidUUID, is_array } from "@cocalc/util/misc";
import {
  //  type Group,
  MAX_TITLE_LENGTH,
  MAX_COLOR_LENGTH,
} from "@cocalc/util/db-schema/groups";

type iGroupMap = any;

export interface GroupsState {
  // map from group_id to immutablejs group that you are an owner of.
  groups?: iGroupMap;
  error: string;
}
export class GroupsStore extends Store<GroupsState> {}

export class GroupsActions extends Actions<GroupsState> {
  constructor(name, redux) {
    super(name, redux);
  }

  getStore = () => this.redux.getStore("groups");

  setError = (error: string) => {
    this.setState({ error });
  };

  // create a new group, with you (and possibly other specified) owners, with the given
  // members, title and color.  Returns the uuid of the neawly created group
  createGroup = async ({
    member_account_ids,
    owner_account_ids,
    title,
    color,
  }: {
    member_account_ids?: string[];
    owner_account_ids?: string[];
    title?: string;
    color?: string;
  }) => {
    const query = {
      create_group: {
        group_id: null,
        owner_account_ids,
        member_account_ids,
        title,
        color,
      },
    };
    const x = await webapp_client.async_query({ query });
    return x.query.create_group.group_pid;
  };

  getMemberAccountIds = (group_id) => {
    return (
      this.getStore()
        .get("groups")
        .getIn([group_id, "member_account_ids"])
        ?.toJS() ?? []
    );
  };

  addMember = async ({ group_id, account_id }) => {
    const member_account_ids = this.getMemberAccountIds(group_id);
    if (member_account_ids.includes(account_id)) {
      return;
    }
    member_account_ids.push(account_id);
    await this.setGroup({ group_id, member_account_ids });
  };

  removeMember = async ({ group_id, account_id }) => {
    let member_account_ids = this.getMemberAccountIds(group_id);
    if (!member_account_ids.includes(account_id)) {
      return;
    }
    // it's possible via a race condition that a member could be included more than once, so we
    // remove all of them
    member_account_ids = member_account_ids.filter((x) => x != account_id);
    console.log({ member_account_ids });
    await this.setGroup({ group_id, member_account_ids });
  };

  getOwnerAccountIds = (group_id) => {
    return (
      this.getStore()
        .get("groups")
        .getIn([group_id, "owner_account_ids"])
        ?.toJS() ?? []
    );
  };

  addOwner = async ({ group_id, account_id }) => {
    const owner_account_ids = this.getOwnerAccountIds(group_id);
    if (owner_account_ids.includes(account_id)) {
      return;
    }
    owner_account_ids.push(account_id);
    await this.setGroup({ group_id, owner_account_ids });
  };

  removeOwner = async ({ group_id, account_id }) => {
    let owner_account_ids = this.getOwnerAccountIds(group_id);
    if (!owner_account_ids.includes(account_id)) {
      return;
    }
    // it's possible via a race condition that a owner could be included more than once, so we
    // remove all of them
    owner_account_ids = owner_account_ids.filter((x) => x != account_id);
    await this.setGroup({ group_id, owner_account_ids });
  };

  setGroup = async ({
    group_id,
    owner_account_ids,
    member_account_ids,
    title,
    color,
  }: {
    group_id: string;
    owner_account_ids?: string[];
    member_account_ids?: string[];
    title?: string;
    color?: string;
  }) => {
    if (owner_account_ids != null && !isValidUUIDarray(owner_account_ids)) {
      throw Error("owner_account_ids must be an array of uuids");
    }
    if (member_account_ids != null && !isValidUUIDarray(member_account_ids)) {
      throw Error("member_account_ids must be an array of uuids");
    }
    if (title && title.length > MAX_TITLE_LENGTH) {
      throw Error(`title must be at most ${MAX_TITLE_LENGTH} long`);
    }
    if (color && color.length > MAX_COLOR_LENGTH) {
      throw Error(`color must be at most ${MAX_COLOR_LENGTH} long`);
    }
    const table = this.redux.getTable("groups")._table;
    table.set(
      {
        group_id,
        owner_account_ids,
        member_account_ids,
        title,
        color,
      },
      "shallow",
    );
    await table.save();
  };
}

class GroupsTable extends Table {
  constructor(name, redux) {
    super(name, redux);
    this.query = this.query.bind(this);
    this._change = this._change.bind(this);
  }

  options() {
    return [];
  }

  query() {
    return {
      groups: [
        {
          group_id: null,
          owner_account_ids: null,
          member_account_ids: null,
          title: null,
          color: null,
        },
      ],
    };
  }

  _change(table, _keys): void {
    const actions = this.redux.getActions("groups");
    if (actions == null) {
      throw Error("actions must be defined");
    }
    const groups = table.get();
    actions.setState({ groups });
  }
}

let initialized = false;
export function init() {
  if (initialized || redux.getStore("groups") != null) {
    return;
  }
  redux.createStore<GroupsState, GroupsStore>("groups", GroupsStore, {
    error: "",
  });
  redux.createActions<GroupsState, GroupsActions>("groups", GroupsActions);
  redux.createTable("groups", GroupsTable);
  initialized = true;
}

function isValidUUIDarray(v: string[]) {
  if (!is_array(v)) {
    return false;
  }
  for (const x of v) {
    if (!isValidUUID(x)) {
      return false;
    }
  }
  return true;
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Functionality and UI to ensure a user with given email (or account_id) is sync'd with stripe.
*/

import { Button, Input, InputNumber, Flex } from "antd";
import { User } from "@cocalc/frontend/frame-editors/generic/client";
import { actions } from "./actions";
import { UserResult } from "./user";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { ADMIN_SEARCH_LIMIT } from "@cocalc/util/db-schema/accounts";

export function UserSearch({}) {
  const status = useTypedRedux("admin-users", "status");
  const query = useTypedRedux("admin-users", "query");
  const limit = useTypedRedux("admin-users", "limit");
  const result = useTypedRedux("admin-users", "result");

  function renderUser(user: User) {
    return <UserResult key={user.account_id} {...user} />;
  }

  return (
    <div style={{ margin: "0 30px" }}>
      <div>
        <Flex style={{ maxWidth: "100%" }}>
          <Input.Search
            allowClear
            autoFocus
            style={{ flex: 1, marginRight: "15px" }}
            value={query}
            placeholder="Search for users by partial name, email, account_id or project_id..."
            onChange={(e) => actions.set_query(e.target.value)}
            onKeyDown={(e) => {
              if (e.keyCode === 13) {
                actions.search();
              }
            }}
            enterButton="Search"
            size="large"
            onSearch={() => {
              actions.search();
            }}
          />
          <InputNumber
            style={{ width: "150px" }}
            size="large"
            defaultValue={limit}
            min={1}
            max={ADMIN_SEARCH_LIMIT}
            step={10}
            onChange={(limit) => {
              if (limit) {
                actions.setState({ limit });
              }
            }}
            addonAfter="Limit"
          />
        </Flex>
        {!!status && (
          <div>
            <pre>{status}</pre>
            <Button onClick={() => actions.clear_status()}>Clear</Button>
          </div>
        )}
        {(result?.size ?? 0) > 0 &&
          result.map((user) => renderUser(user.toJS()))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Alert, Input } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import search from "./search";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import User from "./user";
import { plural } from "@cocalc/util/misc";

export default function Account() {
  const isMountedRef = useIsMountedRef();
  const { id, actions, desc } = useFrameContext();
  const [users, setUsers] = useState<any>(null);
  const [query, setQuery] = useState<string>("");

  const doSearch = useCallback(async (query) => {
    query = query?.trim() ?? "";
    setQuery(query);
    if (!query) {
      setUsers(null);
      return;
    }
    actions.set_frame_data({ id, query });
    const users = await search({ query, admin: true, limit: 100 });
    if (!isMountedRef) return;
    setUsers(users);
  }, []);

  useEffect(() => {
    doSearch(desc.get("data-query"));
  }, []);

  return (
    <div className="smc-vfill">
      <Input.Search
        style={{ margin: "5px", paddingRight: "5px" }}
        allowClear
        defaultValue={desc.get("data-query") ?? ""}
        placeholder="Search by account_id, name or email"
        onSearch={doSearch}
        enterButton
      />
      {users && (
        <>
          {users.length == 0 ? (
            <Alert
              type="warning"
              message={`No Matches for ${query}`}
              style={{ margin: "5px" }}
            />
          ) : (
            <Alert
              type="info"
              message={`${users.length} ${plural(
                users.length,
                "Match",
                "Matches"
              )} for ${query} ${
                users.length >= 100 ? "(search limit is 100)" : ""
              }`}
              style={{ margin: "5px" }}
            />
          )}
        </>
      )}
      {users && (
        <div className="smc-vfill" style={{ overflow: "auto" }}>
          {users.map((user) => (
            <User key={user.account_id} {...user} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { user_search } from "@cocalc/frontend/frame-editors/generic/client";
import { Button, Input } from "antd";
import { editLicenseOwner } from "@cocalc/frontend/purchases/api";
import ShowError from "@cocalc/frontend/components/error";
import { redux } from "@cocalc/frontend/app-framework";

export default function Owner({ account_id, license_id }) {
  const [owner, setOwner] = useState<string>(account_id);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [name, setName] = useState<string>("");
  useEffect(() => {
    (async () => {
      if (account_id == null) {
        setName("No Owner Set");
        return;
      }
      try {
        const x = await user_search({ query: owner, admin: true });
        if (x.length == 0) {
          setName("Owner's account does not exist");
          return;
        }
        setName(`${x[0].first_name} ${x[0].last_name}`);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  });

  const [searchResults, setSearchResults] = useState<
    | {
        first_name?: string;
        last_name?: string;
        account_id: string;
        email_address?: string;
      }[]
    | null
  >(null);

  const onSearch = async (query) => {
    setQuery("");
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const x = await user_search({ query, admin: true });
      setSearchResults(x.slice(0, 5));
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <div style={{ marginBottom: "15px" }}>
      <ShowError error={error} setError={setError} />
      <div style={{ float: "right", marginBottom: "5px" }}>
        <Input.Search
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          style={{ width: "400px", float: "right", marginBottom: "5px" }}
          placeholder="Email address or account_id..."
          enterButton={"Transfer Ownership..."}
          onSearch={onSearch}
        />{" "}
        <div>
          <SearchResults
            owner={owner}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            setError={setError}
            license_id={license_id}
            setOwner={setOwner}
          />
        </div>
      </div>
      Owner: {name}
    </div>
  );
}

function SearchResults({
  owner,
  searchResults,
  setSearchResults,
  license_id,
  setError,
  setOwner,
}) {
  if (searchResults == null) {
    return null;
  }
  if (searchResults.length == 0) {
    return <div>No match</div>;
  }
  return (
    <div>
      {searchResults.map(
        ({ first_name, last_name, account_id, email_address }) => (
          <div style={{ marginTop: "5px" }}>
            <Button
              disabled={owner == account_id}
              onClick={async () => {
                try {
                  setSearchResults(null);
                  await editLicenseOwner({
                    new_account_id: account_id,
                    license_id,
                  });
                  const actions = redux.getActions("admin-site-licenses");
                  await actions.add_manager(license_id, account_id);
                  await setOwner(account_id);
                  actions.load();
                } catch (err) {
                  setError(`${err}`);
                }
              }}
            >
              {owner == account_id ? "Owner Is: " : "Transfer To: "}
              {first_name} {last_name} {email_address} (account_id ={" "}
              {account_id})
            </Button>
            <div style={{ margin: "5px", color: "#666" }}>
              NOTE: The new owner will always be added as a manager, but no
              managers are automatically removed.
            </div>
          </div>
        ),
      )}
    </div>
  );
}

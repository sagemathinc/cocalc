import * as React from "react";
import { List } from "immutable";

import { ABTestResults } from "./ab-test-results";

interface Props {
  search: string;
  on_search_change: (new_search: string) => void;
  submit_search: (query: string) => void;
  ab_test_results: List<any>;
}

export const ABTestBrowser: React.FC<Props> = ({
  search,
  on_search_change,
  submit_search,
  ab_test_results
}) => {
  return (
    <div>
      <form
        onSubmit={e => {
          e.preventDefault();
          submit_search(search);
        }}
      >
        <label>
          What test do you want to see?
          <input
            type="search"
            name="search"
            id="search"
            value={search}
            onChange={e => {
              on_search_change(e.target.value);
            }}
          />
        </label>
      </form>
      <ABTestResults ab_test_entries={ab_test_results} />
    </div>
  );
};

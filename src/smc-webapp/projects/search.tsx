/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import {
  React,
  useEffect,
  useActions,
  usePrevious,
  useState,
  useStore,
} from "../app-framework";
import { SearchInput } from "../r_misc";

interface Props {
  clear_and_focus_search?: number; // when this changes, we clear and focus the search box.
  on_submit?: (switch_to: boolean) => void;
}

export const ProjectsSearch: React.FC<Props> = ({
  clear_and_focus_search,
  on_submit,
}) => {
  const store = useStore("projects");
  const [search, set_search] = useState<string>(store.get("search") ?? "");
  const actions = useActions("projects");
  const prev_clear_and_focus_search = usePrevious(clear_and_focus_search);

  // The usePrevious is necessary because useEffect is called if
  // clear_and_focus_search **might have changed** (e.g., new reference),
  // and it often happens even if it didn't actually change.
  // https://github.com/sagemathinc/cocalc/issues/5402
  useEffect(() => {
    if (
      clear_and_focus_search == null ||
      prev_clear_and_focus_search == null ||
      clear_and_focus_search == prev_clear_and_focus_search
    )
      return;
    set_search("");
  }, [clear_and_focus_search]);

  const debounce_set_search = debounce((search) => {
    actions.setState({ search: search.toLowerCase() });
  }, 300);

  return (
    <SearchInput
      autoFocus={true}
      value={search}
      focus={clear_and_focus_search}
      on_change={(value) => {
        set_search(value);
        debounce_set_search(value);
      }}
      placeholder="Search for projects..."
      on_submit={(_, opts) => on_submit?.(!opts.ctrl_down)}
    />
  );
};

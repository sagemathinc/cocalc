/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import {
  React,
  useEffect,
  useActions,
  useRef,
  useState,
  useStore,
} from "../app-framework";
import { SearchInput } from "../r_misc";

interface Props {
  clear_and_focus_search?: number; // when this changes, we clear and focus the search box.
}

export const ProjectsSearch: React.FC<Props> = ({ clear_and_focus_search }) => {
  const store = useStore("projects");
  const [search, set_search] = useState<string>(store.get("search") ?? "");
  const projects_search_ref = useRef<any>(null);
  const actions = useActions("projects");

  useEffect(() => {
    projects_search_ref.current?.clear_and_focus_search_input();
  }, [clear_and_focus_search]);

  const debounce_set_search = debounce((search) => {
    actions.setState({ search });
  }, 300);

  return (
    <SearchInput
      ref={projects_search_ref}
      autoFocus={true}
      value={search}
      on_change={(value) => {
        set_search(value);
        debounce_set_search(value);
      }}
      placeholder="Search for projects..."
      on_submit={(_, opts) =>
        actions.open_first_visible_project?.(!opts.ctrl_down)
      }
    />
  );
};

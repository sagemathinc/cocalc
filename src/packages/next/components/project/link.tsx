/*
Given a project_id, creates a link to that project showing the title.

This does a database call (with caching) to get the title from the
project_id, so won't be rendered instantly.
*/

import { useEffect, useState } from "react";
import A from "components/misc/A";
import editURL from "lib/share/edit-url";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";

export default function ProjectLink({ project_id }) {
  const [title, setTitle] = useState<string>("");
  useEffect(() => {
    (async () => {
      const query = {
        projects: { project_id, title: null },
      };
      try {
        const title = (await apiPost("/user-query", { query }))?.query?.projects
          ?.title;
        setTitle(title ? title : project_id);
      } catch (_err) {
        setTitle(project_id);
      }
    })();
  }, []);
  let body;
  if (!title) {
    body = <Loading style={{ display: "inline-block" }} />;
  } else {
    body = title;
  }
  return (
    <A href={editURL({ project_id, type: "collaborator" })} external>
      {body}
    </A>
  );
}

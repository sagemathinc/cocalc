/*
Search for any file you've edited in the last year.
*/

import { Input, Tooltip } from "antd";
import { useIntl } from "react-intl";

import { CSS, useState } from "@cocalc/frontend/app-framework";
import api from "@cocalc/frontend/client/api";
import ShowError from "@cocalc/frontend/components/error";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { PathLink } from "@cocalc/frontend/components/path-link";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { MAX_FILENAME_SEARCH_RESULTS } from "@cocalc/util/db-schema/projects";

const { Search } = Input;

interface Props {
  style?: CSS;
}

export function FilenameSearch({ style }: Props) {
  const intl = useIntl();
  const [search, setSearch] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResult] = useState<
    { project_id: string; filename: string; time: Date }[] | null
  >(null);
  const [searched, setSearched] = useState<string>("");

  const doSearch = async () => {
    try {
      setLoading(true);
      setResult(null);
      setSearched(search.trim());
      if (search.trim()) {
        setResult(
          await api("projects/filename-search", { search: search.trim() }),
        );
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={style} role="region" aria-label="Search">
      <Tooltip
        title={`Search filenames of files you edited in the last year.  Use % as wildcard.  At most ${MAX_FILENAME_SEARCH_RESULTS} results shown.`}
      >
        <Search
          allowClear
          loading={loading}
          value={search}
          onChange={(e) => {
            const search = e.target.value;
            setSearch(search);
            if (!search.trim()) {
              setResult(null);
            }
          }}
          placeholder={intl.formatMessage({
            id: "projects.filename-search.placeholder",
            defaultMessage: "Search for filenames you edited...",
          })}
          onSearch={doSearch}
          type="default"
        />
      </Tooltip>
      {((results != null && searched == search.trim()) || error) && (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            background: "white",
            padding: "15px",
            border: "1px solid #ddd",
            boxShadow: "0 0 15px #aaa",
            overflow: "scroll",
            maxHeight: "70vh",
            left: "10px",
            right: "10px",
          }}
        >
          <ShowError error={error} setError={setError} />
          {results != null && results.length > 0 && (
            <div>
              {results.map(({ project_id, filename, time }) => (
                <div key={`${project_id}${filename}`}>
                  <PathLink
                    path={filename}
                    project_id={project_id}
                    trunc={20}
                  />{" "}
                  in <ProjectTitle project_id={project_id} trunc={20} />{" "}
                  <TimeAgo style={{ float: "right" }} date={time} />
                </div>
              ))}
            </div>
          )}
          {results != null && results.length == 0 && <div>no results</div>}
        </div>
      )}
    </div>
  );
}

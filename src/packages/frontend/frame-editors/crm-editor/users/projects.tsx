import { Badge, Button } from "antd";
import LRU from "lru-cache";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { useState } from "react";
import { field_cmp, len, plural } from "@cocalc/util/misc";
import { redux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";

export default function Projects({ account_id }) {
  const [recentProjects, setRecentProjects] = useState<any>(null);
  const [allProjects, setAllProjects] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  return (
    <div
      style={{
        border: "1px solid #eee",
        padding: "5px 10px",
        borderRadius: "5px",
      }}
    >
      <Button.Group>
        <Button
          disabled={loading}
          type={recentProjects != null ? "primary" : undefined}
          onClick={async () => {
            setLoading(true);
            if (allProjects != null) {
              setAllProjects(null);
            }
            if (recentProjects != null) {
              setRecentProjects(null);
            } else {
              setRecentProjects(await getRecentProjects(account_id));
            }
            setLoading(false);
          }}
        >
          <Icon name="pencil" /> Recent Projects{" "}
          {recentProjects != null && (
            <Badge
              count={recentProjects.length}
              style={{ marginLeft: "10px", marginBottom: "2.5px" }}
            />
          )}
        </Button>
        <Button
          disabled={loading}
          type={allProjects != null ? "primary" : undefined}
          onClick={async () => {
            setLoading(true);
            if (recentProjects != null) {
              setRecentProjects(null);
            }
            if (allProjects != null) {
              setAllProjects(null);
            } else {
              setAllProjects(await getAllProjects(account_id));
            }
            setLoading(false);
          }}
        >
          <Icon name="pencil" /> All Projects{" "}
          {allProjects != null && (
            <Badge
              count={allProjects.length}
              style={{ marginLeft: "10px", marginBottom: "2.5px" }}
            />
          )}
        </Button>
      </Button.Group>
      {recentProjects && (
        <div style={{ margin: "15px 5px 0" }}>
          {recentProjects.map((project) => (
            <div>
              <Project {...project} />
            </div>
          ))}
        </div>
      )}{" "}
      {allProjects && (
        <div style={{ margin: "15px 5px 0" }}>
          {allProjects.map((project) => (
            <div>
              <Project {...project} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Project({ project_id, title, last_edited, created, users }) {
  return (
    <div style={{ display: "flex" }}>
      <a
        style={{ flex: 1 }}
        onClick={() => {
          const actions = redux.getActions("projects");
          actions.open_project({ project_id, switch_to: true });
        }}
      >
        {title}
      </a>
      <div style={{ flex: 1, color: "#666" }}>
        active <TimeAgo date={last_edited} />, created{" "}
        <TimeAgo date={created} />,{" "}
        <>
          {len(users)} {plural(len(users), "user")}
        </>
      </div>
    </div>
  );
}

const cache = new LRU<string, any>({ max: 30, ttl: 1000 * 60 });

async function getRecentProjects(account_id: string) {
  if (cache.has(account_id)) {
    return cache.get(account_id);
  }
  const result = (
    await query({
      query: {
        projects: [
          {
            project_id: null,
            title: null,
            description: null,
            users: null,
            last_active: null,
            last_edited: null,
            created: null,
          },
        ],
      },
      options: [{ account_id }],
    })
  ).query.projects;
  result.sort(field_cmp("last_edited"));
  result.reverse();
  cache.set(account_id, result);
  return result;
}

const cacheAll = new LRU<string, any>({ max: 30, ttl: 1000 * 60 });

async function getAllProjects(account_id: string) {
  if (cacheAll.has(account_id)) {
    return cacheAll.get(account_id);
  }

  const result = (
    await query({
      query: {
        projects_all: [
          {
            project_id: null,
            title: null,
            description: null,
            users: null,
            last_active: null,
            last_edited: null,
            created: null,
          },
        ],
      },
      options: [{ account_id }],
    })
  ).query.projects_all;
  result.sort(field_cmp("last_edited"));
  result.reverse();
  cacheAll.set(account_id, result);
  return result;
}

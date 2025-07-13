import { A } from "@cocalc/frontend/components/A";
import ComputeServer, { currentlyEditing } from "./compute-server";
import CreateComputeServer from "./create-compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp, plural } from "@cocalc/util/misc";
import { availableClouds } from "./config";
import {
  Alert,
  Button,
  Input,
  Card,
  Checkbox,
  Radio,
  Switch,
  Tooltip,
} from "antd";
import { useEffect, useState } from "react";
const { Search } = Input;
import { search_match, search_split } from "@cocalc/util/misc";
import {
  SortableList,
  SortableItem,
  DragHandle,
} from "@cocalc/frontend/components/sortable-list";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Icon } from "@cocalc/frontend/components";
import { STATE_TO_NUMBER } from "@cocalc/util/db-schema/compute-servers";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";

export function Docs({ style }: { style? }) {
  return (
    <A style={style} href="https://doc.cocalc.com/compute_server.html">
      <Icon name="external-link" /> Docs
    </A>
  );
}

export default function ComputeServers({ project_id }: { project_id: string }) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");
  const [help, setHelp] = useState<boolean>(false);
  const supported = availableClouds().length > 0;

  return (
    <div style={{ paddingRight: "15px" }}>
      {supported && (
        <>
          <Switch
            checkedChildren={"Help"}
            unCheckedChildren={"Help"}
            style={{ float: "right" }}
            checked={help}
            onChange={setHelp}
          />
          {help && (
            <div style={{ fontSize: "12pt" }}>
              <A href="https://doc.cocalc.com/compute_server.html">
                Compute Servers
              </A>{" "}
              provide <strong>affordable GPUs</strong>,{" "}
              <strong>high end VM's</strong>, <strong>root access</strong>,{" "}
              <strong>Docker</strong> and <strong>Kubernetes</strong> on CoCalc.
              Compute servers are virtual machines where you and your
              collaborators can run Jupyter notebooks, terminals and web servers
              collaboratively, with full access to your project.
              <ul>
                <li>
                  <Icon name="ubuntu" /> Full root and internet access on an
                  Ubuntu Linux server,
                </li>
                <li>
                  <Icon name="server" /> Dedicated GPUs, hundreds of very fast
                  vCPUs, and thousands of GB of RAM
                </li>
                <li>
                  {" "}
                  <Icon name="dns" /> Public ip address and (optional) domain
                  name
                </li>
                <li>
                  {" "}
                  <Icon name="sync" /> Files sync'd with the project
                </li>
              </ul>
              <h3>Getting Started</h3>
              <ul>
                <li>Create a compute server below and start it.</li>
                <li>
                  Once your compute server is running, select it in the upper
                  left of any terminal or Jupyter notebook in this project.{" "}
                </li>
                <li>
                  Compute servers stay running independently of your project, so
                  if you need to restart your project for any reason, that
                  doesn't impact running notebooks and terminals on your compute
                  servers.
                </li>
                <li>
                  A compute server belongs to the user who created it, and they
                  will be billed by the second for usage. Select "Allow
                  Collaborator Control" to allow project collaborators to start
                  and stop a compute server. Project collaborators can always
                  connect to running compute servers.
                </li>
                <li>
                  You can ssh to user@ at the ip address of your compute server
                  using any{" "}
                  <A href="https://doc.cocalc.com/project-settings.html#ssh-keys">
                    project
                  </A>{" "}
                  or{" "}
                  <A href="https://doc.cocalc.com/account/ssh.html">
                    account public ssh keys
                  </A>{" "}
                  that has access to this project (wait about 30 seconds after
                  you add keys). If you start a web service on any port P on
                  your compute server, type{" "}
                  <code>ssh -L P:localhost:P user@ip_address</code>
                  on your laptop, and you can connect to that web service on
                  localhost on your laptop. Also ports 80 and 443 are always
                  publicly visible (so no port forwarding is required). If you
                  connect to root@ip_address, you are root on the underlying
                  virtual machine outside of any Docker container; if you
                  connect to user@ip_address, you are the user inside the main
                  compute container, with full access to your chosen image --
                  this is the same as opening a terminal and selecting the
                  compute server.
                </li>
              </ul>
              <h3>Click this Button ↓</h3>
            </div>
          )}
        </>
      )}
      {supported ? (
        <ComputeServerTable
          computeServers={computeServers}
          project_id={project_id}
          account_id={account_id}
        />
      ) : (
        <b>No Compute Server Clouds are currently enabled.</b>
      )}
    </div>
  );
}

function computeServerToSearch(computeServers, id) {
  return JSON.stringify(computeServers.get(id)).toLowerCase();
}

function ComputeServerTable({
  computeServers: computeServers0,
  project_id,
  account_id,
}) {
  const [computeServers, setComputeServers] = useState<any>(computeServers0);
  useEffect(() => {
    setComputeServers(computeServers0);
  }, [computeServers0]);

  const [search, setSearch0] = useState<string>(
    (get_local_storage(`${project_id}-compute-server-search`) ?? "") as string,
  );
  const setSearch = (value) => {
    setSearch0(value);
    set_local_storage(`${project_id}-compute-server-search`, value);
  };
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<
    "id" | "title" | "custom" | "edited" | "state"
  >(
    (get_local_storage(`${project_id}-compute-server-sort`) ?? "custom") as any,
  );

  if (!computeServers || computeServers.size == 0) {
    return (
      <div style={{ textAlign: "center" }}>
        <CreateComputeServer
          project_id={project_id}
          onCreate={() => setSearch("")}
        />
      </div>
    );
  }
  const search_words = search_split(search.toLowerCase());
  const ids: number[] = [];
  let numDeleted = 0;
  let numSkipped = 0;
  for (const [id] of computeServers) {
    if (currentlyEditing.id == id) {
      // always include the one that is currently being edited.  We wouldn't want,
      // e.g., changing the title shouldn't make the editing modal vanish!
      ids.push(id);
      continue;
    }
    const isDeleted = !!computeServers.getIn([id, "deleted"]);
    if (isDeleted) {
      numDeleted += 1;
    }
    if (showDeleted != isDeleted) {
      continue;
    }
    if (search_words.length > 0) {
      if (
        !search_match(computeServerToSearch(computeServers, id), search_words)
      ) {
        numSkipped += 1;
        continue;
      }
    }
    ids.push(id);
  }
  ids.sort((a, b) => {
    if (a == b) {
      return 0;
    }
    const cs_a = computeServers.get(a);
    const cs_b = computeServers.get(b);
    if (sortBy == "custom") {
      return -cmp(
        cs_a.get("position") ?? cs_a.get("id"),
        cs_b.get("position") ?? cs_b.get("id"),
      );
    } else if (sortBy == "title") {
      return cmp(
        cs_a.get("title")?.toLowerCase(),
        cs_b.get("title")?.toLowerCase(),
      );
    } else if (sortBy == "id") {
      // sort by id
      return -cmp(cs_a.get("id"), cs_b.get("id"));
    } else if (sortBy == "edited") {
      return -cmp(cs_a.get("last_edited") ?? 0, cs_b.get("last_edited") ?? 0);
    } else if (sortBy == "state") {
      const a = cmp(
        STATE_TO_NUMBER[cs_a.get("state")] ?? 100,
        STATE_TO_NUMBER[cs_b.get("state")] ?? 100,
      );
      if (a == 0) {
        return -cmp(
          cs_a.get("position") ?? cs_a.get("id"),
          cs_b.get("position") ?? cs_b.get("id"),
        );
      }
      return a;
    } else {
      return -cmp(cs_a.get("id"), cs_b.get("id"));
    }
  });

  const renderItem = (id) => {
    const server = computeServers.get(id).toJS();

    return (
      <div style={{ display: "flex" }}>
        {sortBy == "custom" && (
          <div
            style={{
              fontSize: "20px",
              color: "#888",
              display: "flex",
              justifyContent: "center",
              flexDirection: "column",
              marginRight: "5px",
            }}
          >
            <DragHandle id={id} />
          </div>
        )}
        <ComputeServer
          server={server}
          style={{ marginBottom: "10px" }}
          key={`${id}`}
          editable={account_id == server.account_id}
          controls={{ setShowDeleted }}
        />
      </div>
    );
  };

  const v: React.JSX.Element[] = [];
  for (const id of ids) {
    v.push(
      <SortableItem key={`${id}`} id={id}>
        {renderItem(id)}
      </SortableItem>,
    );
  }

  return (
    <div style={{ margin: "5px" }}>
      <div style={{ margin: "15px 0", textAlign: "center" }} key="create">
        <CreateComputeServer
          project_id={project_id}
          onCreate={() => setSearch("")}
        />
      </div>
      <Card>
        <div style={{ marginBottom: "15px" }}>
          {computeServers.size > 1 && (
            <Search
              allowClear
              placeholder={`Filter ${computeServers.size} Compute ${plural(
                computeServers.size,
                "Server",
              )}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 300, maxWidth: "100%" }}
            />
          )}
          {computeServers.size > 1 && (
            <span
              style={{
                marginLeft: "15px",
                display: "inline-block",
                marginTop: "5px",
                float: "right",
              }}
            >
              Sort:{" "}
              <Radio.Group
                buttonStyle="solid"
                value={sortBy}
                size="small"
                onChange={(e) => {
                  setSortBy(e.target.value);
                  try {
                    set_local_storage(
                      `${project_id}-compute-server-sort`,
                      e.target.value,
                    );
                  } catch (_) {}
                }}
              >
                <Tooltip title="Custom sort order with drag and drop via handle on the left">
                  <Radio.Button value="custom">Custom</Radio.Button>
                </Tooltip>
                <Tooltip title="Sort by state with most alive (e.g., 'running') being first">
                  <Radio.Button value="state">State</Radio.Button>
                </Tooltip>
                <Tooltip title="Sort by when something about compute server last changed">
                  <Radio.Button value="edited">Changed</Radio.Button>
                </Tooltip>
                <Tooltip title="Sort in alphabetical order by the title">
                  <Radio.Button value="title">Title</Radio.Button>
                </Tooltip>
                <Tooltip title="Sort by the numerical id from highest (newest) to lowest (oldest)">
                  <Radio.Button value="id">Id</Radio.Button>
                </Tooltip>
              </Radio.Group>
            </span>
          )}
          {numDeleted > 0 && (
            <Checkbox
              style={{ marginLeft: "10px", marginTop: "5px" }}
              checked={showDeleted}
              onChange={() => setShowDeleted(!showDeleted)}
            >
              Deleted ({numDeleted})
            </Checkbox>
          )}
        </div>
        {numSkipped > 0 && (
          <Alert
            showIcon
            style={{ margin: "15px auto", maxWidth: "600px" }}
            type="warning"
            message={
              <div style={{ marginTop: "5px" }}>
                Not showing {numSkipped} compute servers due to current filter.
                <Button
                  type="text"
                  style={{ float: "right", marginTop: "-5px" }}
                  onClick={() => setSearch("")}
                >
                  Clear
                </Button>
              </div>
            }
          />
        )}
        <div
          style={{ /* maxHeight: "60vh", overflow: "auto", */ width: "100%" }}
        >
          <SortableList
            disabled={sortBy != "custom"}
            items={ids}
            Item={({ id }) => renderItem(id)}
            onDragStop={(oldIndex, newIndex) => {
              let position;
              if (newIndex == ids.length - 1) {
                const last = computeServers.get(ids[ids.length - 1]);
                // putting it at the bottom, so subtract 1 from very bottom position
                position = (last.get("position") ?? last.get("id")) - 1;
              } else {
                // putting it above what was at position newIndex.
                if (newIndex == 0) {
                  // very top
                  const first = computeServers.get(ids[0]);
                  // putting it at the bottom, so subtract 1 from very bottom position
                  position = (first.get("position") ?? first.get("id")) + 1;
                } else {
                  // not at the very top: between two
                  let x, y;
                  if (newIndex > oldIndex) {
                    x = computeServers.get(ids[newIndex]);
                    y = computeServers.get(ids[newIndex + 1]);
                  } else {
                    x = computeServers.get(ids[newIndex - 1]);
                    y = computeServers.get(ids[newIndex]);
                  }

                  const x0 = x.get("position") ?? x.get("id");
                  const y0 = y.get("position") ?? y.get("id");
                  // TODO: yes, positions could get too close and this doesn't work, and then
                  // we have to globally reset them all.  This is done for jupyter etc.
                  // not implemented here *yet*.
                  position = (x0 + y0) / 2;
                }
              }
              const id = ids[oldIndex];
              let cur = computeServers.get(ids[oldIndex]);
              cur = cur.set("position", position);
              setComputeServers(computeServers.set(ids[oldIndex], cur));
              (async () => {
                try {
                  await webapp_client.async_query({
                    query: {
                      compute_servers: {
                        id,
                        project_id,
                        position,
                      },
                    },
                  });
                } catch (err) {
                  console.warn(err);
                }
              })();
            }}
          >
            {v}
          </SortableList>
        </div>
      </Card>
    </div>
  );
}

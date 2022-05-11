import { useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import apiPost from "lib/api/post";
import Loading from "components/share/loading";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Popconfirm,
  Popover,
  Table,
} from "antd";
import { Quota as LicenseQuota } from "./license";
import Avatar from "components/account/avatar";
import UserName from "components/account/name";
import { EditableDescription, EditableTitle } from "./editable-license";
import { search_split, search_match } from "@cocalc/util/misc";
import { cmp, plural } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";
import Timestamp from "components/misc/timestamp";
import License, { DateRange } from "./license";
import SelectUsers from "components/account/select-users";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";

const renderTimestamp = (epoch) => <Timestamp epoch={epoch} />;

export const quotaColumn = {
  title: (
    <Popover
      title="Quota"
      content={
        <div style={{ maxWidth: "75ex" }}>
          This is the license quota. If the license is active on a project, its
          quotas will be set to at least the values listed here.
        </div>
      }
    >
      Quota{" "}
    </Popover>
  ),
  width: "35%",
  responsive: ["sm"],
  render: (_, license) => <Quota {...license} />,
};

export function Quota({ quota, state, upgrades }) {
  return state != null && state != "running" ? (
    <span>—</span>
  ) : (
    <span
      style={{
        wordWrap: "break-word",
        wordBreak: "break-word",
      }}
    >
      {quota && <LicenseQuota quota={quota} />}
      {/* upgrades is deprecated, but in case we encounter it, do not ignore it */}
      {upgrades && <pre>{JSON.stringify(upgrades)}</pre>}
    </span>
  );
}

function TitleDescId({ title, description, id, onChange }) {
  return (
    <div
      style={{
        wordWrap: "break-word",
        wordBreak: "break-word",
        color: "#333",
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: "9pt" }}>
        <License license_id={id} />
      </div>
      <EditableTitle license_id={id} title={title} onChange={onChange} />
      <EditableDescription
        license_id={id}
        description={description}
        onChange={onChange}
      />
    </div>
  );
}

function Managers({ managers, id, onChange }) {
  return (
    <>
      <div style={{ maxHeight: "65px", overflowY: "auto" }}>
        {managers.map((account_id) => (
          <Avatar
            style={{ margin: "0 5px 5px 0" }}
            key={account_id}
            account_id={account_id}
            size={24}
            extra={
              <RemoveManager
                license_id={id}
                managers={managers}
                account_id={account_id}
                onChange={onChange}
              />
            }
          />
        ))}
      </div>
      <AddManagers license_id={id} managers={managers} onChange={onChange} />
    </>
  );
}

function RunLimit({ run_limit }) {
  return <>{run_limit}</>;
}

function LastUsed({ last_used }) {
  return renderTimestamp(last_used);
}

function Created({ created }) {
  return renderTimestamp(created);
}

function columns(onChange) {
  return [
    {
      responsive: ["xs"],
      title: "Managed Licenses",
      render: (_, license) => (
        <div>
          <TitleDescId {...license} onChange={onChange} />
          <div>
            <DateRange {...license} />
          </div>{" "}
          Run Limit: <RunLimit {...license} />
          <div>
            Quota: <Quota {...license} />
          </div>
          Last Used: <LastUsed {...license} />
          <br />
          Created: <Created {...license} />
          <div style={{ border: "1px solid lightgrey", padding: "5px 15px" }}>
            Managers <Managers {...license} onChange={onChange} />
          </div>
        </div>
      ),
    },
    {
      responsive: ["sm"],
      title: (
        <Popover
          placement="top"
          title="Id, Title and Description of the License"
          content={
            <div style={{ maxWidth: "75ex" }}>
              The first line is the id of the license, which anybody can enter
              in various places to upgrade projects or courses. The title and
              description of the license help you keep track of what the license
              is for, and you can edit both fields here as well by clicking on
              them.
            </div>
          }
        >
          License
        </Popover>
      ),
      key: "title",
      width: "40%",
      sorter: { compare: (a, b) => cmp(a.title, b.title) },
      render: (_, license) => (
        <div>
          <TitleDescId {...license} onChange={onChange} />
          <div>
            <DateRange {...license} />
          </div>
        </div>
      ),
    },
    {
      responsive: ["sm"],
      width: "15%",
      title: (
        <Popover
          title="Managers"
          content={
            <div style={{ maxWidth: "75ex" }}>
              These are the managers of this license. They can see extra
              information about the license, the license is included in any
              dropdown where they can select a license, and they can add or
              remove other license managers. You are a manager of all licenses
              listed here.
            </div>
          }
        >
          Managers
        </Popover>
      ),
      key: "managers",
      render: (_, license) => <Managers {...license} onChange={onChange} />,
    },
    {
      responsive: ["sm"],
      title: (
        <Popover
          placement="top"
          title="Run Limit"
          content={
            <div style={{ maxWidth: "75ex" }}>
              The maximum number of simultaneous running projects that this
              license can upgrade. You can apply the license to any number of
              projects, but it only impacts this many projects at once.
            </div>
          }
        >
          Run Limit
        </Popover>
      ),
      align: "center",
      render: (_, license) => <RunLimit {...license} />,
      sorter: { compare: (a, b) => cmp(a.run_limit, b.run_limit) },
    },
    quotaColumn,
    {
      responsive: ["sm"],
      title: (
        <Popover
          placement="top"
          title="When License was Last Used"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when this license was last used to upgrade a project when
              the project was starting. It's the point in time when the project
              started.
            </div>
          }
        >
          Last Used{" "}
        </Popover>
      ),
      render: (_, license) => <LastUsed {...license} />,
      sorter: { compare: (a, b) => cmp(a.last_used, b.last_used) },
    },
    /*   {
      responsive: ["sm"],
      title: (
        <Popover
          placement="top"
          title="When License Becomes Activate"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when the license becomes active. In can be in the future,
              in which case the license will be valid and useful in the future,
              but not right now.
            </div>
          }
        >
          Activates{" "}
        </Popover>
      ),
      render: (_, license) => <Activates {...license} />,
      sorter: { compare: (a, b) => cmp(a.activates, b.activates) },
    },
    {
      responsive: ["sm"],
      title: (
        <Popover
          placement="top"
          title="When License Expires"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when the license expires. Unless there is a subscription
              that renews it, after this point in time the license will stop
              upgrading projects.
            </div>
          }
        >
          Expires{" "}
        </Popover>
      ),
      render: (_, license) => <Expires {...license} />,
      sorter: { compare: (a, b) => cmp(a.expires, b.expires) },
    },*/
    {
      responsive: ["sm"],
      title: (
        <Popover
          placement="top"
          title="When License was Created"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when the license was created.
            </div>
          }
        >
          Created{" "}
        </Popover>
      ),
      render: (_, license) => <Created {...license} />,
      sorter: { compare: (a, b) => cmp(a.created, b.created) },
    },
  ];
}

export default function ManagedLicenses() {
  let { result, error, call } = useAPI("licenses/get-managed");
  const [search, setSearch] = useState<string>("");
  const [showExpired, setShowExpired] = useState<boolean>(false);
  const numExpired: number = useMemo(() => {
    if (!result) return 0;
    let n = 0;
    const t = new Date().valueOf();
    for (const x of result) {
      if (x.expires && x.expires <= t) {
        n += 1;
      }
    }
    return n;
  }, [result]);

  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading style={{ fontSize: "16pt", margin: "auto" }} />;
  }

  if (search) {
    result = doSearch(result, search);
  }
  if (!showExpired) {
    // filter out anything that is expired
    result = removeExpired(result);
  }

  function onChange() {
    call();
  }

  return (
    <div style={{ width: "100%", overflowX: "auto", minHeight: "50vh" }}>
      <h3>Licenses that you Manage ({result.length})</h3>
      These are the licenses that you have purchased or been added to manage.
      You can add other people as managers of any of these licenses, if they
      need to be able to use these licenses to upgrade projects. You can also{" "}
      <A href="/billing/subscriptions">
        manage your purchased subscriptions
      </A>{" "}
      and browse <A href="/billing/receipts">your receipts and invoices</A>.
      <div style={{ margin: "15px 0" }}>
        <Checkbox
          disabled={numExpired == 0}
          style={{ float: "right" }}
          checked={showExpired}
          onChange={(e) => setShowExpired(e.target.checked)}
        >
          Show Expired ({numExpired})
        </Checkbox>
        <Input.Search
          placeholder="Search..."
          allowClear
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "50ex", maxWidth: "100%" }}
        />
      </div>
      <Table
        columns={columns(onChange) as any}
        dataSource={result}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
    </div>
  );
}

function doSearch(data: object[], search: string): object[] {
  const v = search_split(search.toLowerCase().trim());
  const w: object[] = [];
  for (const x of data) {
    if (x["search"] == null) {
      x["search"] = `${x["title"] ?? ""} ${x["description"] ?? ""} ${x["id"]} ${
        x["info"]?.purchased?.subscription
      }`.toLowerCase();
    }
    if (search_match(x["search"], v)) {
      w.push(x);
    }
  }
  return w;
}

function removeExpired(data: { expires?: number }[]): { expires?: number }[] {
  const data1: { expires?: number }[] = [];
  const now = new Date().valueOf();
  for (const x of data) {
    if (!(x.expires != null && x.expires <= now)) {
      data1.push(x);
    }
  }
  return data1;
}

interface AddManagersProps {
  license_id: string;
  managers: string[];
  onChange?: () => void;
}

function AddManagers({ license_id, managers, onChange }: AddManagersProps) {
  const [adding, setAdding] = useState<boolean>(false);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const { account } = useCustomize();
  return (
    <div>
      {adding && (
        <Button
          size="small"
          style={{ float: "right" }}
          onClick={() => {
            setAdding(false);
            setError("");
            setAccountIds([]);
          }}
        >
          Cancel
        </Button>
      )}
      <Button
        disabled={adding}
        style={{ marginTop: "5px" }}
        size="small"
        onClick={() => {
          setAdding(true);
          setAccountIds([]);
          setError("");
        }}
      >
        <Icon name="plus-circle" /> Add
      </Button>
      {adding && (
        <div style={{ width: "300px", marginTop: "5px" }}>
          {error && <Alert type="error" message={error} />}
          <Button
            disabled={accountIds.length == 0}
            onClick={async () => {
              setError("");
              const query = {
                manager_site_licenses: {
                  id: license_id,
                  managers: managers.concat(accountIds),
                },
              };
              try {
                await apiPost("/user-query", { query });
                setAdding(false);
                onChange?.();
              } catch (err) {
                setError(err.message);
              }
            }}
            style={{ marginBottom: "5px", width: "100%" }}
            type="primary"
          >
            <Icon name="check" /> Add {accountIds.length}{" "}
            {plural(accountIds.length, "selected user")}
          </Button>
          <SelectUsers
            autoFocus
            onChange={setAccountIds}
            exclude={managers.concat(
              account?.account_id ? [account.account_id] : []
            )}
          />
        </div>
      )}
    </div>
  );
}

interface RemoveManagerProps {
  license_id: string;
  account_id: string;
  managers: string[];
  onChange?: () => void;
}

function RemoveManager({
  license_id,
  managers,
  account_id,
  onChange,
}: RemoveManagerProps) {
  const [error, setError] = useState<string>("");
  const { account } = useCustomize();
  return (
    <Popconfirm
      zIndex={20000 /* compare with user search */}
      title={
        <>
          {account?.account_id == account_id ? (
            <>
              Remove <b>yourself</b> as a manager of this license?
            </>
          ) : (
            <>
              Remove manager{" "}
              <b>
                <UserName account_id={account_id} />?
              </b>
              <br />
              <UserName account_id={account_id} /> will no longer see this
              license listed under licenses they manage.
            </>
          )}
          <br /> The license will <i>not</i> be automatically removed from any
          projects.
        </>
      }
      onConfirm={async () => {
        setError("");
        const query = {
          manager_site_licenses: {
            id: license_id,
            managers: managers.filter((x) => x != account_id),
          },
        };
        try {
          await apiPost("/user-query", { query });
          onChange?.();
        } catch (err) {
          setError(err.message);
        }
      }}
      okText={"Remove"}
      cancelText={"Cancel"}
    >
      <div>
        <a>Remove as Manager...</a>
        {error && (
          <Alert
            type="error"
            message={"Error Removing Manager"}
            description={error}
          />
        )}
      </div>
    </Popconfirm>
  );
}

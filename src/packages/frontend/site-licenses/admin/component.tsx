/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Viewing and configuring site licenses
*/

import { Alert, Button, Popconfirm } from "antd";
import { DebounceInput } from "react-debounce-input";

import {
  React,
  Rendered,
  useIsMountedRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  Loading,
  r_join,
  Gap,
} from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { actions } from "./actions";
import { License } from "./license";
import { download_data } from "./download-data";

const LICENSE_QUERY = {
  site_licenses: [
    {
      id: null,
      title: null,
      description: null,
      info: null,
      expires: null,
      activates: null,
      created: null,
      last_used: null,
      managers: null,
      restricted: null,
      upgrades: null,
      quota: null,
      run_limit: null,
    },
  ],
};

export const SiteLicenses: React.FC<{}> = () => {
  function useField(name) {
    return useTypedRedux("admin-site-licenses", name);
  }
  const error = useField("error");
  const loading = useField("loading");
  const creating = useField("creating");
  const site_licenses = useField("site_licenses");
  const editing = useField("editing");
  const saving = useField("saving");
  const edits = useField("edits");
  const show_projects = useField("show_projects");
  const search = useField("search");
  const usage_stats = useField("usage_stats");
  const manager_info = useField("manager_info");

  const [show_export, set_show_export] = useState<boolean>(false);
  const [exporting, set_exporting] = useState<boolean>(false);

  const isMountedRef = useIsMountedRef();

  function render_error(): Rendered {
    if (!error) return;
    return <ErrorDisplay error={error} onClose={() => actions.set_error("")} />;
  }

  function render_loading(): Rendered {
    if (loading) {
      return (
        <Loading theme="medium" style={{ float: "right", fontSize: "20pt" }} />
      );
    }
  }

  function render_license(license): Rendered {
    const id = license.get("id");
    return (
      <License
        key={id}
        license={license}
        editing={editing != null && editing.has(id)}
        saving={saving != null && saving.has(id)}
        edits={edits != null ? edits.get(id) : undefined}
        show_projects={show_projects?.get(id)}
        usage_stats={usage_stats?.get(id)}
        manager_info={
          manager_info?.get("license_id") == id ? manager_info : undefined
        }
      />
    );
  }

  function render_main() {
    if (!site_licenses) return;
    const v: Rendered[] = [];
    for (const license of site_licenses) {
      v.push(render_license(license));
    }
    return r_join(v, <div style={{ height: "20px" }}></div>);
  }

  function render_search_button(): Rendered {
    return (
      <Button
        onClick={() => actions.load()}
        disabled={loading || !search}
        style={{ margin: "15px 0" }}
      >
        <Icon name="refresh" /> Refresh
      </Button>
    );
  }

  function render_create_new_license(): Rendered {
    return (
      <Popconfirm
        title={"Are you sure you want to create a new license?"}
        onConfirm={() => actions.create_new_license()}
        okText={"Yes"}
        cancelText={"Cancel"}
      >
        <Button
          disabled={creating}
          style={{ margin: "15px 0", float: "right" }}
        >
          <Icon name="plus" spin={creating} />
          <Gap /> Create license...
        </Button>
      </Popconfirm>
    );
  }

  function render_search(): Rendered {
    return (
      <div>
        <DebounceInput
          placeholder={"Search..."}
          style={{
            marginLeft: "5px",
            width: "40ex",
            padding: "5px",
            border: "1px solid lightgrey",
            borderRadius: "3px",
          }}
          value={search ?? ""}
          onChange={(e) => actions.set_search((e.target as any).value)}
          onKeyUp={(e) => {
            if (e.keyCode === 13) {
              actions.load();
            }
          }}
        />
        <div style={{ color: COLORS.GRAY }}>
          Search licenses by id, title, description, info, manager name and
          email address.
        </div>
      </div>
    );
  }

  function render_search_restriction_note(): Rendered {
    if (site_licenses?.size) {
      return (
        <b style={{ margin: "0 10px" }}>
          Showing the most recent {site_licenses.size}{" "}
          {plural(site_licenses.size, "license")} matching the search{" "}
          <a
            onClick={() => {
              actions.set_search("");
              actions.load();
            }}
          >
            (clear)
          </a>
          .
        </b>
      );
    }
  }

  async function do_export(): Promise<void> {
    set_exporting(true);
    set_show_export(false);
    const q = await webapp_client.query_client.query({
      query: LICENSE_QUERY,
      options: [{ limit: 9999999 }],
    });
    if (!isMountedRef.current) return;
    const result = q.query.site_licenses;
    download_data("license-export.json", JSON.stringify(result, undefined, 2));
    set_exporting(false);
  }

  function render_export(): React.JSX.Element {
    return (
      <span>
        <Button disabled={show_export} onClick={() => set_show_export(true)}>
          Export...
        </Button>
        {show_export && (
          <Alert
            style={{ margin: "15px" }}
            message={
              <a onClick={do_export}>
                {!search?.trim()
                  ? "Click here to download ALL licenses as a single LARGE JSON file."
                  : `Click here to download the ${site_licenses?.size} matching licenses as a JSON
            file.`}
              </a>
            }
            type="success"
            closable
            onClose={() => set_show_export(false)}
          />
        )}
        {exporting && (
          <span>
            <Loading /> Exporting...
          </span>
        )}
      </span>
    );
  }

  return (
    <div style={{ margin: "0 30px" }}>
      {render_error()}
      <div>
        {render_search()}
        <Gap />
        <Gap />
        {render_search_button()}
        <Gap />
        <Gap />
        {render_create_new_license()}
        <Gap />
        <Gap />
        {render_search_restriction_note()}
        {render_export()}
        {render_loading()}
      </div>
      {render_main()}
    </div>
  );
};

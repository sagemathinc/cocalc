/*
Viewing and configuring site licenses
*/

import {
  React,
  Rendered,
  Component,
  rtypes,
  rclass,
  TypedMap
} from "../../app-framework";
import { ErrorDisplay, Icon, Loading, Space, r_join } from "../../r_misc";
import { SiteLicense } from "./types";
import { actions } from "./actions";
import { List, Map, Set } from "immutable";
import { Button, Popconfirm } from "antd";
import { License } from "./license";

interface Props {
  view?: boolean; // if true, open for viewing/editing
  error?: string;
  loading?: boolean;
  creating?: boolean;
  site_licenses?: List<TypedMap<SiteLicense>>;
  editing?: Set<string>;
  edits?: Map<string, TypedMap<SiteLicense>>;
  search?: string;
  matches_search?: Set<string>;
  usage_stats?: Map<string, number>;
}

class SiteLicenses extends Component<Props> {
  static reduxProps() {
    return {
      "admin-site-licenses": {
        view: rtypes.bool,
        error: rtypes.string,
        loading: rtypes.bool,
        creating: rtypes.bool,
        site_licenses: rtypes.immutable.List,
        editing: rtypes.immutable.Set,
        edits: rtypes.immutable.Map,
        search: rtypes.string,
        matches_search: rtypes.immutable.Set,
        usage_stats: rtypes.immutable.Map
      }
    };
  }

  private render_error(): Rendered {
    if (!this.props.error) return;
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => actions.set_error("")}
      />
    );
  }

  private render_loading(): Rendered {
    if (this.props.loading) {
      return <Loading theme="medium" />;
    }
  }

  private render_license(license: TypedMap<SiteLicense>): Rendered {
    const id = license.get("id");
    return (
      <License
        key={id}
        license={license}
        editing={this.props.editing != null && this.props.editing.has(id)}
        edits={this.props.edits != null ? this.props.edits.get(id) : undefined}
        usage_stats={
          this.props.usage_stats != null
            ? this.props.usage_stats.get(id)
            : undefined
        }
      />
    );
  }

  private render_main(): void | Rendered[] {
    if (!this.props.view) return;
    if (!this.props.site_licenses) return;
    const v: Rendered[] = [];
    for (const license of this.props.site_licenses) {
      if (
        this.props.search &&
        this.props.matches_search != null &&
        !this.props.matches_search.has(license.get("id"))
      ) {
        continue;
      }
      v.push(this.render_license(license));
    }
    return r_join(v, <div style={{ height: "20px" }}></div>);
  }

  private render_header_toggle(): Rendered {
    return (
      <h4
        onClick={() => actions.set_view(!this.props.view)}
        style={{ cursor: "pointer" }}
      >
        <Icon
          style={{ width: "20px" }}
          name={this.props.view ? "caret-down" : "caret-right"}
        />{" "}
        Site Licenses
      </h4>
    );
  }

  private render_reload_button(): Rendered {
    if (!this.props.view) return;
    return (
      <Button
        onClick={() => actions.load()}
        disabled={this.props.loading}
        style={{ margin: "15px 0" }}
      >
        <Icon name="sync" spin={this.props.loading} />
        <Space /> Reload
      </Button>
    );
  }

  private render_create_new_license(): Rendered {
    if (!this.props.view) return;
    return (
      <Popconfirm
        title={"Are you sure you want to create a new license?"}
        onConfirm={() => actions.create_new_license()}
        okText={"Yes"}
        cancelText={"Cancel"}
      >
        <Button disabled={this.props.creating} style={{ margin: "15px 0" }}>
          <Icon name="plus" spin={this.props.creating} />
          <Space /> New...
        </Button>
      </Popconfirm>
    );
  }

  private render_search(): Rendered {
    if (!this.props.view) return;
    return (
      <span>
        <input
          placeholder={"Search"}
          style={{ marginLeft: "5px", width: "40ex", padding: "5px" }}
          value={this.props.search ?? ""}
          onChange={e => actions.set_search((e.target as any).value.trim())}
        />
      </span>
    );
  }

  private render_search_restriction_note(): Rendered {
    if (this.props.matches_search != null && this.props.site_licenses != null) {
      return (
        <b style={{ marginLeft: "10px" }}>
          Showing {this.props.matches_search.size} of{" "}
          {this.props.site_licenses.size} licenses
        </b>
      );
    }
  }

  render(): Rendered {
    return (
      <div>
        {this.render_header_toggle()}
        <div style={{ margin: "0 10%" }}>
          {this.render_error()}
          <div>
            {this.render_reload_button()}
            <Space />
            <Space />
            {this.render_create_new_license()}
            <Space />
            <Space />
            {this.render_search()}
            {this.render_search_restriction_note()}
            {this.render_loading()}
          </div>
          {this.render_main()}
        </div>
      </div>
    );
  }
}

const c = rclass(SiteLicenses);
export { c as SiteLicenses };

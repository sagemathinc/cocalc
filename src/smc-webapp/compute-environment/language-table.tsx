/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "react-bootstrap";
import { CSS, React, useMemo, useTypedRedux } from "../app-framework";
import { A } from "../r_misc";
import { by_lowercase } from "./utils";

interface Props {
  lang: string;
  version_click: Function;
}

export const LanguageTable: React.FC<Props> = ({ lang, version_click }) => {
  const full_inventory = useTypedRedux("compute-environment", "inventory");
  const inventory = useMemo(() => full_inventory?.get(lang), [full_inventory]);
  const language_exes = useMemo(() => full_inventory?.get("language_exes"), [
    full_inventory,
  ]);
  const components = useTypedRedux("compute-environment", "components")?.get(
    lang
  );
  if (inventory == null || components == null || language_exes == null) {
    return <></>;
  }

  function lang_table_header(): JSX.Element {
    if (inventory == null || language_exes == null) return <></>;
    const v: JSX.Element[] = [];
    for (const inventory_idx of inventory.keys()) {
      v.push(
        <th key={inventory_idx} style={{ whiteSpace: "nowrap" }}>
          {language_exes.getIn([inventory_idx, "name"])}
        </th>
      );
    }

    return (
      <thead>
        <tr>
          <th key={"__package"}>Package</th>
          {v}
        </tr>
      </thead>
    );
  }

  function lang_table_body_row_versions(component_idx: string): JSX.Element[] {
    const v: JSX.Element[] = [];
    if (inventory == null) return v;
    const add_row = (inventory_idx) => {
      const info = inventory?.getIn([inventory_idx, component_idx]);
      if (info == null) {
        v.push(<td key={inventory_idx}></td>);
      } else {
        v.push(
          <td
            key={inventory_idx}
            style={{ cursor: "pointer" }}
            onClick={() => version_click(inventory_idx, component_idx)}
          >
            {info}
          </td>
        );
      }
    };
    for (const inventory_idx of inventory.keys()) {
      add_row(inventory_idx);
    }
    return v;
  }

  function lang_table_body_row_name(component_idx: string): JSX.Element {
    const style = { fontWeight: "bold" } as CSS;
    const summary = { fontSize: "80%" } as CSS;

    // @ts-ignore  -- just being lazy about sufficiently precise typing...
    const component_info = components?.get(component_idx)?.toJS();
    if (component_info) {
      return (
        <td key={"__name"}>
          <div style={style}>
            {component_info.url ? (
              <A href={component_info.url}>{component_info.name}</A>
            ) : (
              component_info.name
            )}
          </div>
          {component_info.summary && (
            <div style={summary}>{component_info.summary}</div>
          )}
        </td>
      );
    } else {
      return (
        <td key={"name"}>
          <div style={style}>{component_idx}</div>
        </td>
      );
    }
  }

  function lang_table_body_row(component_idx: string): JSX.Element {
    return (
      <tr key={component_idx}>
        {lang_table_body_row_name(component_idx)}
        {lang_table_body_row_versions(component_idx)}
      </tr>
    );
  }

  function lang_table_body(): JSX.Element {
    if (components == null) return <></>;
    const component_idxs: string[] = [];
    for (const k of components.keys()) {
      component_idxs.push(k);
    }
    component_idxs.sort(by_lowercase);

    return (
      <tbody>
        {component_idxs.map((component_idx) =>
          lang_table_body_row(component_idx)
        )}
      </tbody>
    );
  }

  return (
    <Table striped bordered condensed hover>
      {lang_table_header()}
      {lang_table_body()}
    </Table>
  );
};

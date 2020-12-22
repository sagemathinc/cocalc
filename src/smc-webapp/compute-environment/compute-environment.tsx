/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Modal, Tab, Tabs } from "react-bootstrap";
import {
  CSS,
  React,
  useActions,
  useEffect,
  useState,
  useTypedRedux,
} from "../app-framework";
import { A, Loading, Markdown } from "../r_misc";
import { Button, Row, Col } from "../antd-bootstrap";
import { li_style } from "../info/style";
import { keys } from "smc-util/misc";
import { SiteName } from "../customize";

import { by_lowercase, full_lang_name } from "./utils";
import { SoftwareTable } from "./software-table";

export const ComputeEnvironment: React.FC = React.memo(() => {
  const inventory = useTypedRedux("compute-environment", "inventory");
  const components = useTypedRedux("compute-environment", "components");
  const selected_lang = useTypedRedux("compute-environment", "selected_lang");
  const langs = useTypedRedux("compute-environment", "langs");
  const actions = useActions("compute-environment");

  const [show_version_popup, set_show_version_popup] = useState<boolean>(false);
  const [inventory_idx, set_inventory_idx] = useState<string>("");
  const [component_idx, set_component_idx] = useState<string>("");

  useEffect(() => {
    actions.load();
  }, []);

  function version_click(inventory_idx: string, component_idx: string): void {
    set_show_version_popup(true);
    set_inventory_idx(inventory_idx);
    set_component_idx(component_idx);
  }

  function version_close(): void {
    set_show_version_popup(false);
  }

  function version_information_popup(): JSX.Element | undefined {
    const lang_info = inventory?.getIn(["language_exes", inventory_idx]);
    if (lang_info == null) {
      return;
    }
    const version =
      inventory?.getIn([selected_lang, inventory_idx, component_idx]) ?? "?";
    // we're optimistic and treat 'description' as markdown,
    // but in reality it might be plaintext, Rst or HTML
    const component_info = components?.getIn([selected_lang, component_idx]);
    const description = component_info?.get("descr");
    // doc is often an html link, but sometimes not.
    // Hence we treat it as an arbitrary string and use Markdown to turn it into a URL if possible.
    const doc = component_info?.get("doc");
    const url = component_info?.get("url");
    const name = component_info?.get("name");
    const lang_env_name = lang_info.get("name") ?? inventory_idx;
    const jupyter_bridge_url =
      "https://github.com/sagemathinc/cocalc/wiki/sagejupyter#-question-how-do-i-start-a-jupyter-kernel-in-a-sage-worksheet";
    const style_descr = {
      maxHeight: "12rem",
      overflowY: "auto",
    } as CSS;
    const jupyter_kernel = (() => {
      switch (lang_info.get("lang")) {
        case "julia":
          return "julia-1.4";
        case "python":
          return "python3";
        case "octave":
          return "octave";
        case "R":
          return "ir";
        default:
          return lang_info.get("lang");
      }
    })();

    return (
      <Modal
        key={"modal"}
        show={show_version_popup}
        onHide={version_close}
        animation={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Library <b>{component_idx}</b> ({version})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p style={{ fontWeight: "bold" }}>
            The library {url ? <A href={url}>{name}</A> : name} is available in
            version {version} as part of the {lang_env_name} environment.
          </p>
          {doc != null ? (
            <p>
              <Markdown value={`Documentation: ${doc}`} />
            </p>
          ) : undefined}
          {description != null && (
            <p style={style_descr}>
              <Markdown value={description} />
            </p>
          )}
          <p>You can access it by</p>
          <ul>
            <li style={li_style}>
              selecting the appropriate Kernel in a Jupyter Notebook,
            </li>
            <li style={li_style}>
              load it from within a SageMath Worksheet via the{" "}
              <A href={jupyter_bridge_url}>Jupyter Bridge</A>. E.g. for
              Anaconda:
              <pre>
                kernel = jupyter('{jupyter_kernel}')1 %default_mode kernel
              </pre>
            </li>
            <li style={li_style}>
              or run it in a Terminal ("Files" → "Terminal")
            </li>
          </ul>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={version_close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  function render_tab_content(lang: string): JSX.Element {
    if (lang !== selected_lang) {
      return <span />;
    }
    return (
      <div style={{ height: "75vh", overflowY: "scroll", overflowX: "hidden" }}>
        <SoftwareTable lang={lang} version_click={version_click} />
      </div>
    );
  }

  function render_control_tabs(): JSX.Element[] {
    if (langs == null) return [];
    const v: JSX.Element[] = [];
    for (const lang of langs) {
      v.push(
        <Tab key={lang} eventKey={lang} title={full_lang_name(lang)}>
          {render_tab_content(lang)}
        </Tab>
      );
    }
    return v;
  }

  function tabs(): JSX.Element {
    return (
      <Tabs
        key={"tabs"}
        activeKey={selected_lang}
        onSelect={(key) => actions.setState({ selected_lang: key })}
        animation={false}
        style={{ width: "100%" }}
        id={"about-compute-environment-tabs"}
      >
        {render_control_tabs()}
      </Tabs>
    );
  }

  function environment_information(): JSX.Element {
    const num: { [env: string]: number } = {};
    for (let env of ["R", "julia", "python", "executables"]) {
      num[env] = keys(components?.get(env)?.toJS() ?? {}).length;
    }
    num.language_exes = keys(
      inventory?.get("language_exes")?.toJS() ?? {}
    ).length;
    const execs = inventory?.get("language_exes")?.toJS() ?? {};
    const exec_keys: string[] = keys(execs);
    exec_keys.sort((a, b) => by_lowercase(execs[a].name, execs[b].name));

    const v: JSX.Element[] = [];
    for (const k of exec_keys) {
      const info = execs[k];
      if (info == null) continue;
      v.push(
        <li key={k} style={li_style}>
          <b>
            <A href={info.url}>{info.name}</A>
            {":"}
          </b>{" "}
          {info.doc}
        </li>
      );
    }

    return (
      <div key={"intro"} style={{ marginBottom: "20px" }}>
        <p>
          <SiteName /> offers a comprehensive collection of software
          environments and libraries. There are {num.python} Python packages,{" "}
          {num.R} R packages, {num.julia} Julia libraries and more than{" "}
          {num.executables} executables installed. Click on a version number to
          learn more about the particular library.
        </p>
        <p>
          This overview shows {num.language_exes} programming language
          environments:
        </p>
        <ul style={{ margin: "10px 0" }}>{v}</ul>
      </div>
    );
  }

  function ui(): (JSX.Element | undefined)[] {
    return [version_information_popup(), environment_information(), tabs()];
  }

  return (
    <Row>
      <Col>
        <h3>Software and Programming Libraries Details</h3>
        {inventory != null && components != null ? (
          (langs?.size ?? 0) > 0 ? (
            ui()
          ) : (
            // Only shown if explicitly requested but no data available
            <div>Compute environment information not available.</div>
          )
        ) : (
          <Loading />
        )}
      </Col>
    </Row>
  );
});

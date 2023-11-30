/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// help users selecting a kernel
import type { TabsProps } from "antd";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Popover,
  Row,
  Spin,
  Tabs,
  Typography,
} from "antd";
import { Map as ImmutableMap, List, OrderedMap } from "immutable";
import { sortBy } from "lodash";

import {
  CSS,
  React,
  Rendered,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend//app-framework";
import {
  A,
  Icon,
  Markdown,
  Paragraph,
  Text,
} from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import track from "@cocalc/frontend/user-tracking";
import { Kernel as KernelType } from "@cocalc/jupyter/util/misc";
import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { KernelStar } from "../components/run-button/kernel-star";
import { useProjectContext } from "../project/context";
import { FIXED_PROJECT_TABS } from "../project/page/file-tab";
import { JupyterActions } from "./browser-actions";
import Logo from "./logo";

const MAIN_STYLE: CSS = {
  padding: "20px 10px",
  overflowY: "auto",
  overflowX: "hidden",
  background: COLORS.GRAY_LL,
} as const;

const SELECTION_STYLE: CSS = {
  marginTop: "2em",
} as const;

const ALL_LANGS_LABEL_STYLE: CSS = {
  fontWeight: "bold",
  color: COLORS.GRAY_D,
} as const;

interface KernelSelectorProps {
  actions: JupyterActions;
}

export const KernelSelector: React.FC<KernelSelectorProps> = React.memo(
  (props: KernelSelectorProps) => {
    const { actions } = props;
    const editor_settings = useTypedRedux("account", "editor_settings");

    const redux_kernel: undefined | string = useRedux([actions.name, "kernel"]);
    const no_kernel = redux_kernel === "";
    // undefined and empty string are both treated as "null" aka "no kernel"
    const kernel = !redux_kernel ? null : redux_kernel;
    const default_kernel: undefined | string = useRedux([
      actions.name,
      "default_kernel",
    ]);
    const closestKernel: undefined | KernelType = useRedux([
      actions.name,
      "closestKernel",
    ]);
    const kernel_info: undefined | ImmutableMap<any, any> = useRedux([
      actions.name,
      "kernel_info",
    ]);
    const kernel_selection: undefined | ImmutableMap<string, string> = useRedux(
      [actions.name, "kernel_selection"],
    );
    const kernels_by_name:
      | undefined
      | OrderedMap<string, ImmutableMap<string, string>> = useRedux([
      actions.name,
      "kernels_by_name",
    ]);
    const kernels_by_language: undefined | OrderedMap<string, List<string>> =
      useRedux([actions.name, "kernels_by_language"]);

    const compute_servers_enabled = useTypedRedux(
      "customize",
      "compute_servers_enabled",
    );

    function kernel_name(name: string): string | undefined {
      return kernel_attr(name, "display_name");
    }

    function kernel_attr(name: string, attr: string): string | undefined {
      if (kernels_by_name == null) return undefined;
      const k = kernels_by_name.get(name);
      if (k == null) return undefined;
      return k.get(attr, name);
    }

    function render_suggested_link(cocalc) {
      if (cocalc == null) return;
      const url: string | undefined = cocalc.get("url");
      const descr: string | undefined = cocalc.get("description", "");
      if (url != null) {
        return (
          <a href={url} target={"_blank"} rel={"noopener"}>
            {descr}
          </a>
        );
      } else {
        return descr;
      }
    }

    function render_kernel_button(name: string): Rendered {
      const lang = kernel_attr(name, "language");
      const priority: number = kernels_by_name
        ?.get(name)
        ?.getIn(["metadata", "cocalc", "priority"]) as number;
      return (
        <Button
          key={`kernel-${lang}-${name}`}
          onClick={() => {
            actions.select_kernel(name);
            track("jupyter", {
              action: "select-kernel",
              kernel: name,
              how: "click-button-in-dialog",
            });
          }}
          style={{ marginBottom: "5px", height: "35px" }}
        >
          <Logo
            kernel={name}
            size={30}
            style={{ marginTop: "-2.5px", marginRight: "5px" }}
          />{" "}
          {kernel_name(name) || name}
          <KernelStar priority={priority} />
        </Button>
      );
    }

    function render_suggested() {
      if (kernel_selection == null || kernels_by_name == null) return;

      const entries: Rendered[] = [];
      const kbn = kernels_by_name;

      kernel_selection
        .sort((a, b) => {
          return -misc.cmp(
            kbn.getIn([a, "metadata", "cocalc", "priority"], 0),
            kbn.getIn([b, "metadata", "cocalc", "priority"], 0),
          );
        })
        .map((name, lang) => {
          const cocalc: ImmutableMap<string, any> = kbn.getIn(
            [name, "metadata", "cocalc"],
            null,
          ) as any;
          if (cocalc == null) return;
          const prio: number = cocalc.get("priority", 0);

          // drop those below 10, priority is too low
          if (prio < 10) return;

          const label = render_kernel_button(name);

          entries.push(
            <Descriptions.Item key={lang} label={label}>
              <div>{render_suggested_link(cocalc)}</div>
            </Descriptions.Item>,
          );
        });

      if (entries.length == 0) return;

      return (
        <Descriptions
          title="Suggested kernels"
          bordered
          column={1}
          style={SELECTION_STYLE}
        >
          {entries}
        </Descriptions>
      );
    }

    function render_custom(): Rendered {
      if (kernels_by_language?.size == 0) return;
      return (
        <Descriptions bordered column={1} style={SELECTION_STYLE}>
          <Descriptions.Item label={"Custom kernels"}>
            <a onClick={() => actions.custom_jupyter_kernel_docs()}>
              How to create a custom kernel...
            </a>
          </Descriptions.Item>
        </Descriptions>
      );
    }

    function render_no_kernels(): Rendered[] {
      return [
        <Descriptions.Item key="no_kernels" label={<Icon name="ban" />}>
          <Button.Group>
            <Paragraph>
              There are no kernels available. <SiteName /> searches the standard
              paths of Jupyter{" "}
              <Popover
                trigger={["click", "hover"]}
                content={
                  <>
                    i.e. essentially <Text code>jupyter kernelspec list</Text>{" "}
                    going through{" "}
                    <Text code>jupyter --paths --json | jq .data</Text>
                  </>
                }
              >
                <Icon
                  style={{ color: COLORS.GRAY, cursor: "pointer" }}
                  name="question-circle"
                />
              </Popover>{" "}
              for kernels. You can also define{" "}
              <a onClick={() => actions.custom_jupyter_kernel_docs()}>
                a custom kernel
              </a>
              .
            </Paragraph>
          </Button.Group>
        </Descriptions.Item>,
      ];
    }

    function render_all_langs(): Rendered[] | undefined {
      if (kernels_by_language == null) return render_no_kernels();

      const all: Rendered[] = [];
      kernels_by_language.forEach((names, lang) => {
        const kernels = names.map((name) => render_kernel_button(name));

        const label = (
          <span style={ALL_LANGS_LABEL_STYLE}>{misc.capitalize(lang)}</span>
        );

        all.push(
          <Descriptions.Item key={lang} label={label}>
            <Button.Group style={{ display: "flex", flexWrap: "wrap" }}>
              {kernels}
            </Button.Group>
          </Descriptions.Item>,
        );
        return true;
      });

      if (all.length == 0) return render_no_kernels();

      return all;
    }

    function showComputeServersTab(items) {
      if (!compute_servers_enabled) return;

      items.push({
        key: "compute_servers",
        label: (
          <>
            <Icon name="servers" /> Compute servers
          </>
        ),
        children: <ComputeServerInfo />,
      });
    }

    function render_select_all() {
      const all = render_all_langs();

      const items: TabsProps["items"] = [
        {
          key: "all",
          label: (
            <>
              <Icon name="jupyter" /> All kernels by language
            </>
          ),
          children: (
            <Descriptions bordered column={1} style={SELECTION_STYLE}>
              {all}
            </Descriptions>
          ),
        },
      ];

      showComputeServersTab(items);

      return (
        <Tabs
          defaultActiveKey="all"
          items={items}
          onTabClick={(key) => {
            track("jupyter-selector", { action: "tab-click", tab: key });
          }}
        />
      );
    }

    function render_last() {
      const name = default_kernel;
      if (name == null) return;
      if (kernels_by_name == null) return;
      // also don't render "last", if we do not know that kernel!
      if (!kernels_by_name.has(name)) return;
      if (editor_settings == null) return <Spin />;
      const ask_jupyter_kernel =
        editor_settings.get("ask_jupyter_kernel") ?? true;

      return (
        <Descriptions bordered column={1} style={SELECTION_STYLE}>
          <Descriptions.Item label={"Quick select"}>
            <div>
              Your most recently selected kernel {render_kernel_button(name)}
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={"Make default"}>
            <Checkbox
              checked={!ask_jupyter_kernel}
              onChange={(e) => {
                track("jupyter", {
                  action: "dont_ask_kernel",
                  dont_ask: e.target.checked,
                });
                dont_ask_again_click(e.target.checked);
              }}
            >
              Do not ask again. Instead, default to your most recent selection.
            </Checkbox>
            <div>
              <Typography.Text type="secondary">
                You can always change the kernel by clicking on the kernel
                selector at the top right.
              </Typography.Text>
            </div>
          </Descriptions.Item>
        </Descriptions>
      );
    }

    function dont_ask_again_click(checked: boolean) {
      actions.kernel_dont_ask_again(checked);
    }

    function render_top() {
      if (kernel == null || kernel_info == null) {
        let msg: Rendered;
        // kernel, but no info means it is not known
        if (kernel != null && kernel_info == null) {
          msg = (
            <>
              Your notebook kernel <code>"{kernel}"</code> does not exist on{" "}
              <SiteName />.
            </>
          );
        } else {
          msg = <>This notebook has no kernel.</>;
        }
        return (
          <Paragraph>
            <Text strong>{msg}</Text> A working kernel is required in order to
            evaluate the code in the notebook. Please select one for the
            programming language you want to work with. Otherwise{" "}
            <Button
              size="small"
              type={no_kernel ? "primary" : "default"}
              onClick={() => actions.select_kernel("")}
            >
              continue without a kernel
            </Button>
            .
          </Paragraph>
        );
      } else {
        const name = kernel_name(kernel);
        const current =
          name != null ? `The currently selected kernel is "${name}".` : "";

        return (
          <Paragraph>
            <Text strong>Select a new kernel.</Text> {current}
          </Paragraph>
        );
      }
    }

    function render_unknown() {
      if (kernel_info != null || closestKernel == null) return;
      const closestKernelName = closestKernel.get("name");
      if (closestKernelName == null) return;

      return (
        <Descriptions
          bordered
          column={1}
          style={{ backgroundColor: COLORS.ATND_BG_RED_M }}
        >
          <Descriptions.Item label={"Unknown Kernel"}>
            A similar kernel might be {render_kernel_button(closestKernelName)}.
          </Descriptions.Item>
        </Descriptions>
      );
    }

    function render_footer(): Rendered {
      return (
        <div style={{ color: COLORS.GRAY, paddingBottom: "2em" }}>
          <Paragraph>
            <Text strong>Note:</Text> You can always change the selected kernel
            later in the Kernel menu or by clicking on the kernel status logo in
            the top right.
          </Paragraph>
        </div>
      );
    }

    function render_close_button(): Rendered | undefined {
      if (kernel == null || kernel_info == null) return;
      return (
        <Button
          style={{ float: "right", marginTop: "10px" }}
          onClick={() => actions.hide_select_kernel()}
        >
          Close
        </Button>
      );
    }

    function render_body(): Rendered {
      if (kernels_by_name == null || kernel_selection == null) {
        return <Spin />;
      } else {
        return (
          <>
            {render_top()}
            {render_unknown()}
            {render_last()}
            {render_suggested()}
            {render_select_all()}
            {render_custom()}
            <hr />
            {render_footer()}
          </>
        );
      }
    }

    function render_head(): Rendered {
      return (
        <Row justify="space-between">
          <Col flex={1}>
            <h3>Select a Kernel</h3>
          </Col>
          <Col flex={"auto"}>{render_close_button()}</Col>
        </Row>
      );
    }

    function checkObvious(): boolean {
      const name = closestKernel?.get("name");
      if (!name) return false;
      if (kernel != "sagemath") return false;
      // just do it -- this happens when automatically converting
      // a sage worksheet to jupyter via the "Jupyter" button.
      setTimeout(() => actions.select_kernel(name), 0);
      return true;
    }

    if (checkObvious()) {
      // avoid flicker displaying big error.
      return null;
    }
    return (
      <div style={MAIN_STYLE} className={"smc-vfill"}>
        <Card
          title={render_head()}
          style={{ margin: "0 auto", maxWidth: "900px" }}
        >
          {render_body()}
        </Card>
      </div>
    );
  },
);

function ComputeServerInfo() {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  // sort all images with a jupyter kernel by IMAGES[key].label
  const sortedImageKeys = sortBy(
    Object.keys(IMAGES).filter((key) => IMAGES[key].jupyterKernels !== false),
    (key) => IMAGES[key].label,
  );

  const computeImages: Rendered[] = sortedImageKeys.map((key) => {
    const image = IMAGES[key];

    const label = (
      <span style={ALL_LANGS_LABEL_STYLE}>
        <Icon name={image.icon} /> {image.label}
      </span>
    );

    return (
      <Descriptions.Item key={key} label={label}>
        <Markdown value={image.description} />
      </Descriptions.Item>
    );
  });

  return (
    <div>
      <Paragraph>
        Besides all locally available kernels inside this project, you can also
        instantiate a{" "}
        <Text strong>
          <A href={"https://doc.cocalc.com/compute_server.html"}>
            Compute Server
          </A>
        </Text>{" "}
        and configure this notebook to connect to one of its kernels. This is
        useful if you want to get access to a{" "}
        <Text strong>GPU accellerator</Text>, run a kernel that is{" "}
        <Text strong>not available locally</Text>, or if you want to make use of{" "}
        <Text strong>a much more powerful machine</Text>.
      </Paragraph>
      <Paragraph>
        Compute servers are not only more powerful, but also much more
        configurable. You can install any software you want and also connect via
        a <A href="https://doc.cocalc.com/terminal.html">Terminal</A>.
      </Paragraph>
      <Alert
        type="info"
        message={
          <>
            To get started, open the{" "}
            <Button onClick={() => actions?.set_active_tab("servers")}>
              <Icon name={FIXED_PROJECT_TABS.servers.icon} />{" "}
              {FIXED_PROJECT_TABS.servers.label}
            </Button>{" "}
            panel and instantiate and start your compute machine. Then, select
            the machine for this notebook, and pick one of the available kernels
            of that machine.
          </>
        }
      />

      <Descriptions bordered column={1} style={SELECTION_STYLE}>
        {computeImages}
      </Descriptions>
    </div>
  );
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell: ignore descr prio dont

// help users selecting a kernel
import type { TabsProps } from "antd";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Popover,
  Spin,
  Tabs,
  Tooltip,
  Typography,
} from "antd";
import { Map as ImmutableMap, List, OrderedMap } from "immutable";
import { FormattedMessage, useIntl } from "react-intl";
import {
  CSS,
  Rendered,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useState } from "react";
import { useAppContext } from "@cocalc/frontend/app/context";
import {
  A,
  Icon,
  isIconName,
  Markdown,
  Paragraph,
  Text,
} from "@cocalc/frontend/components";
import { useImages } from "@cocalc/frontend/compute/images-hook";
import { SiteName } from "@cocalc/frontend/customize";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";
import { Kernel as KernelType } from "@cocalc/jupyter/util/misc";
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

export function KernelSelector({ actions }: KernelSelectorProps) {
  const intl = useIntl();

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
  const kernel_selection: undefined | ImmutableMap<string, string> = useRedux([
    actions.name,
    "kernel_selection",
  ]);
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
    const key = `kernel-${lang}-${name}`;
    const btn = (
      <Button
        key={key}
        onClick={() => {
          actions.select_kernel(name);
          track("jupyter", {
            action: "select-kernel",
            kernel: name,
            how: "click-button-in-dialog",
          });
        }}
        style={{ height: "35px" }}
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
    const cocalc = kernels_by_name?.getIn([name, "metadata", "cocalc"]);
    if (cocalc == null) {
      return btn;
    }
    return (
      <Tooltip key={key} color="white" title={render_suggested_link(cocalc)}>
        {btn}
      </Tooltip>
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
          <Descriptions.Item key={`${name}-${lang}`} label={label}>
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

    if (!IS_MOBILE) {
      showComputeServersTab(items);
    }

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
        <Descriptions.Item
          label={
            <FormattedMessage
              id="jupyter.select-kernel.quick-select.label"
              defaultMessage={"Quick select"}
            />
          }
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <FormattedMessage
              id="jupyter.select-kernel.quick-select.text"
              defaultMessage={"Your most recently selected kernel"}
              description={"Kernel in a Jupyter Notebook"}
            />{" "}
            <div style={{ width: "15px" }} /> {render_kernel_button(name)}
          </div>
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <FormattedMessage
              id="jupyter.select-kernel.make-default.label"
              defaultMessage={"Make default"}
            />
          }
        >
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
            <FormattedMessage
              id="jupyter.select-kernel.make-default.text"
              defaultMessage={
                "Do not ask again. Instead, default to your most recent selection."
              }
              description={"Kernel in a Jupyter Notebook"}
            />
          </Checkbox>
          <div>
            <Typography.Text type="secondary">
              <FormattedMessage
                id="jupyter.select-kernel.make-default.info"
                defaultMessage={
                  "You can always change the kernel by clicking on the kernel selector at the top right."
                }
                description={"Kernel in a Jupyter Notebook"}
              />
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
            {actions.getComputeServerIdSync() ? (
              "this compute server"
            ) : (
              <>
                the <SiteName /> Home Base environment
              </>
            )}
            .
          </>
        );
      } else {
        msg = (
          <FormattedMessage
            id="jupyter.select-kernel.header.no-kernel"
            defaultMessage={"This notebook has no kernel."}
            description={"Kernel in a Jupyter Notebook"}
          />
        );
      }
      return (
        <Paragraph>
          <Text strong>{msg}</Text>{" "}
          <FormattedMessage
            id="jupyter.select-kernel.header.no-kernel-explanation"
            defaultMessage={
              "A working kernel is required in order to evaluate the code in the notebook. Please select one for the programming language you want to work with. Otherwise <Button>continue without a kernel</Button>."
            }
            description={"Kernel in a Jupyter Notebook"}
            values={{
              Button: (ch) => (
                <Button
                  size="small"
                  type={no_kernel ? "primary" : "default"}
                  onClick={() => actions.select_kernel("")}
                >
                  {ch}
                </Button>
              ),
            }}
          />
        </Paragraph>
      );
    } else {
      const name = kernel_name(kernel);
      const current =
        name != null
          ? intl.formatMessage(
              {
                id: "jupyter.select-kernel.header.current",
                defaultMessage: `The currently selected kernel is "{name}".`,
                description: "Kernel in a Jupyter Notebook",
              },
              { name },
            )
          : "";

      return (
        <Paragraph>
          <Text strong>
            <FormattedMessage
              id="jupyter.select-kernel.header.message"
              defaultMessage={"Select a new kernel."}
              description={"Kernel in a Jupyter Notebook"}
            />
          </Text>{" "}
          {current}
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
        style={{ backgroundColor: COLORS.ANTD_BG_RED_M }}
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
          <FormattedMessage
            id="jupyter.select_kernel.footer"
            defaultMessage="<strong>Note:</strong> You can always change the selected kernel later in the Kernel menu or by clicking on the kernel status logo in the top left."
            description="Jupyter kernel selector, bottom."
            values={{
              strong: (c) => <Text strong>{c}</Text>,
            }}
          />
        </Paragraph>
      </div>
    );
  }

  function renderCloseButton(): Rendered | undefined {
    return (
      <Button
        style={{ marginRight: "5px" }}
        onClick={() => actions.hide_select_kernel()}
      >
        Close
      </Button>
    );
  }

  const [refreshingKernels, setRefreshingKernels] = useState<boolean>(false);
  function renderRefreshButton(): Rendered | undefined {
    const loading = kernel == null || kernel_info == null || refreshingKernels;
    return (
      <Button
        disabled={loading}
        onClick={async () => {
          try {
            setRefreshingKernels(true);
            await actions.fetch_jupyter_kernels({ noCache: true });
          } finally {
            setRefreshingKernels(false);
          }
        }}
      >
        <Icon name="refresh" spin={loading} /> Refresh
      </Button>
    );
  }

  function render_body(): Rendered {
    if (kernels_by_name == null || kernel_selection == null) {
      return (
        <div>
          {render_top()}
          <Spin />
        </div>
      );
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
      <div>
        <div style={{ float: "right", display: "flex", alignItems: "center" }}>
          {renderCloseButton()}
          {renderRefreshButton()}
        </div>
        <h3>{intl.formatMessage(labels.select_a_kernel)}</h3>
      </div>
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

  if (IS_MOBILE) {
    /*
NOTE: I tried viewing this on mobile and it is so HORRIBLE!
Something about the CSS and Typography components are just truly
a horrific disaster.  This one component though is maybe usable.
*/
    return (
      <div
        style={{
          overflow: "auto",
          padding: "20px 10px",
        }}
        className={"smc-vfill"}
      >
        <div style={{ float: "right" }}>
          {renderCloseButton()}
          {renderRefreshButton()}
        </div>
        {render_select_all()}
      </div>
    );
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
}

function ComputeServerInfo() {
  const { formatIntl } = useAppContext();
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const [IMAGES, ImagesError] = useImages();
  if (ImagesError) {
    return ImagesError;
  }
  if (IMAGES == null) {
    return <Spin />;
  }

  // sort all enabled non-system images with a jupyter kernel by priority first, then
  // IMAGES[key].label
  const sortedImageKeys = Object.keys(IMAGES)
    .filter(
      (key) =>
        !IMAGES[key].disabled &&
        !IMAGES[key].system &&
        IMAGES[key].jupyterKernels !== false,
    )
    .sort((x, y) => {
      const xp = IMAGES[x].priority ?? 0;
      const yp = IMAGES[y].priority ?? 0;
      if (xp > yp) {
        return -1;
      }
      if (xp < yp) {
        return 1;
      }
      const xl = IMAGES[x].label;
      const yl = IMAGES[y].label;
      if (xl < yl) {
        return -1;
      }
      if (xl > yl) {
        return 1;
      }
      return 0;
    });

  const computeImages: Rendered[] = sortedImageKeys.map((key) => {
    const image = IMAGES[key];

    const label = (
      <div style={{ ...ALL_LANGS_LABEL_STYLE, textAlign: "center" }}>
        {isIconName(image.icon) && (
          <>
            <Icon name={image.icon} style={{ fontSize: "24pt" }} />
            <br />
          </>
        )}{" "}
        {image.label}
      </div>
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
        <Text strong>GPU accelerator</Text>, run a kernel that is{" "}
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
            <Button onClick={() => actions?.showComputeServers()}>
              <Icon name={FIXED_PROJECT_TABS.servers.icon} />{" "}
              {formatIntl(FIXED_PROJECT_TABS.servers.label)}
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

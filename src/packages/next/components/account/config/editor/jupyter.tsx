import register from "../register";
import { Space } from "antd";
import Loading from "components/share/loading";
import A from "components/misc/A";
import useEditTable from "lib/hooks/edit-table";
import { JUPYTER_CLASSIC_MODERN } from "@cocalc/util/theme";

const desc = {
  jupyter_line_numbers: `Display line numbers to the left of input cells in Jupyter notebooks.`,
  ask_jupyter_kernel: `Each time you create a new Jupyter notebook, by default it will ask which kernel to use.
If you disable this option, then new notebooks will open using the kernel that you most recently explicitly
selected.  You can of course change the kernel of any notebook at any time in the Kernel dropdown menu.`,
  disable_jupyter_virtualization: `By default Jupyter notebooks are rendered using "virtualization", so only the visible cells are actually rendered.   If you select this option, then we instead render entire notebook. This is potentially much slower but may address some issues.  You must close and open your notebook to see the change.`,
  jupyter_classic: `CoCalc includes a mode where it embeds
the classical Jupyter notebook in an iframe and installs a plugin to enable realtime collaboration.
However, collaboration does not work as well as in the default Jupyter editor.`,
};

interface Data {
  editor_settings: {
    ask_jupyter_kernel?: boolean;
    jupyter_line_numbers?: boolean;
    disable_jupyter_virtualization?: boolean;
    jupyter_classic?: boolean;
  };
}

register({
  path: "editor/jupyter",
  title: "Jupyter Notebooks",
  icon: "ipynb",
  desc: "Configuration options specific to Jupyter notebooks, e.g., line numbers for input cells or asking for the kernel for new notebooks.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditBoolean } = useEditTable<Data>({
      accounts: { editor_settings: null },
    });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />
        <EditBoolean
          icon="list-ol"
          path="editor_settings.jupyter_line_numbers"
          title="Line Numbers"
          desc={desc.jupyter_line_numbers}
          label="Line numbers"
        />
        <EditBoolean
          icon="question-circle"
          path="editor_settings.ask_jupyter_kernel"
          title="New Notebook Kernel"
          desc={desc.ask_jupyter_kernel}
          label="Ask which kernel to use"
        />{" "}
        <EditBoolean
          icon="list"
          path="editor_settings.disable_jupyter_virtualization"
          title="Disable Jupyter Virtualization"
          desc={desc.disable_jupyter_virtualization}
          label={
            <>
              No virtualization -- render entire notebook rather than
              rendering just the visible part of it using{" "}
              <A href="https://virtuoso.dev/">react-virtuoso</A>.
            </>
          }
        />{" "}
        <EditBoolean
          icon="ipynb"
          path="editor_settings.jupyter_classic"
          title="Jupyter Classic"
          desc={
            <>
              {desc.jupyter_classic}{" "}
              <A href={JUPYTER_CLASSIC_MODERN}>
                (DANGER: this can cause trouble...)
              </A>{" "}
              You can also{" "}
              <A href="https://doc.cocalc.com/jupyter.html#alternatives-plain-jupyter-server-and-jupyterlab-server">
                very easily use a standard JupyterLab or Jupyter classic server
              </A>{" "}
              from any CoCalc project, without changing this setting.
            </>
          }
          label="Use Jupyter classic"
        />{" "}
      </Space>
    );
  },
});

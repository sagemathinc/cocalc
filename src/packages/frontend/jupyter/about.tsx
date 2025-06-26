/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
About dialog -- provides info about the Jupyter Notebook
*/
import { Modal } from "antd";
import { FormattedMessage } from "react-intl";
import Ansi from "@cocalc/frontend/components/ansi-to-react";
import { A, Icon, Paragraph, Title } from "@cocalc/frontend/components";
import { ShowSupportLink } from "@cocalc/frontend/support";
import { KernelInfo } from "@cocalc/jupyter/types";
import { COLORS, JUPYTER_CLASSIC_MODERN } from "@cocalc/util/theme";
import { JupyterActions } from "./browser-actions";

interface AboutProps {
  actions: JupyterActions;
  about?: boolean;
  backend_kernel_info?: KernelInfo;
}

export function About(props: AboutProps) {
  const { actions, about = false, backend_kernel_info } = props;

  function close(): void {
    actions.setState({ about: false });
    actions.focus(true);
  }

  function render_server_info(): React.JSX.Element {
    const version =
      backend_kernel_info != null
        ? backend_kernel_info.get("nodejs_version")
        : undefined;
    if (!version) {
      return (
        <Paragraph>
          <FormattedMessage
            id="juypter.about.server_info_waiting"
            description={
              "Waiting for the Server information of the online service"
            }
            defaultMessage={"Waiting for server information to be available..."}
          />
        </Paragraph>
      );
    }
    return <pre>Node.js Version {version}</pre>;
  }

  function render_kernel_info(): React.JSX.Element {
    const banner =
      backend_kernel_info != null
        ? backend_kernel_info.get("banner")
        : undefined;
    if (banner == null) {
      return (
        <Paragraph>
          <FormattedMessage
            id="juypter.about.kernel_info_waiting"
            description={
              "Waiting for the Kernel information of Jupyter Notebook"
            }
            defaultMessage={"Waiting for kernel to be available..."}
          />
        </Paragraph>
      );
    }
    return (
      <pre>
        <Ansi>{banner}</Ansi>
      </pre>
    );
  }

  function render_faq(): React.JSX.Element {
    return (
      <Paragraph>
        Read <A href="https://doc.cocalc.com/jupyter.html">documentation</A>
        , create a <ShowSupportLink />, or check the latest{" "}
        <A href={JUPYTER_CLASSIC_MODERN}>status of Jupyter in CoCalc.</A>
      </Paragraph>
    );
  }

  function render_features(): React.JSX.Element {
    return (
      <Paragraph
        style={{
          backgroundColor: COLORS.GRAY_LLL,
          padding: "10px",
          marginTop: "10px",
          borderRadius: "5px",
        }}
      >
        <FormattedMessage
          id="jupyter.about.features"
          description={
            "Detailed feature information about the Jupyter Notebook implementation in CoCalc"
          }
          defaultMessage={`
        <ul>
          <li>
            <b>Realtime sync:</b> Multiple people can simultaneously edit notebooks:
            multiple cursors, document-wide user-specific undo and redo, realtime synchronized ipywidgets
          </li>
          <li>
            <b>Document split:</b> edit and see multiple parts of a large notebook at once
          </li>
          <li>
            <b>TimeTravel:</b> see detailed history of exactly how a notebook was created
          </li>
          <li>
            <b>Text/Markdown:</b> powerful graphical editor for markdown cells,
            so you can write nicely formatted text to explain your code without having to write markdown directly.
          </li>
          <li>
            <b>AI Assistant:</b> Several AI tools help you to understand error messages, refine code, generate new code cells based on context, or just explain/document existing code.
          </li>
          <li>
            <b>Snippets:</b> code samples for many kernels
          </li>
          <li>
            <b>Whiteboard:</b> create a whiteboard (documented ending in ".board") and use Jupyter cells as part of your whiteboard
          </li>
          <li>
            <b>Zoom:</b> easily change font size
          </li>
          <li>
            <b>Code folding:</b> see structure of input
          </li>
          <li>
            <b>Code formatting:</b> click the Format button to automatically format your code and markdown.
          </li>
          <li>
            <b>Modern look:</b> buttons, menus and cell execution hints that better reflect state
          </li>
          <li>
            <b>Large output:</b> server-side throttling, windowing, and buffering
          </li>
          <li>
            <b>Background capture of output:</b> works if no user has the notebook open (<A>discussion</A>)
          </li>
          <li>
            <b>Mobile support:</b> phones and tablets
          </li>
          <li>
            <b>Cell creation:</b> click blue line between cells to create new cells
          </li>
          <li>
            <b>Share:</b> your work is visible publicly via our fast lightweight notebook viewer
          </li>
          <li>
            <b>LaTeX:</b> export notebook to LaTeX, then edit the generated LaTeX directly in CoCalc.
          </li>
          <li>
            <b>Keybindings and color schemes:</b> VIM, Emacs, and Sublime keybindings, and many color schemes (in account settings)
          </li>
        </ul>`}
          values={{
            A: (ch) => (
              <A href="https://github.com/jupyterlab/jupyterlab/issues/6545#issuecomment-501259211">
                {ch}
              </A>
            ),
          }}
        />
      </Paragraph>
    );
  }

  return (
    <Modal
      width={900}
      open={about}
      onOk={close}
      onCancel={close} // for the X at the top right
      okText={"Close"}
      cancelButtonProps={{ style: { display: "none" } }}
      title={
        <Title level={2}>
          <Icon name="question-circle" /> CoCalc's Jupyter Notebook
        </Title>
      }
    >
      <FormattedMessage
        id="jupyter.about.message"
        description={
          "Notes about CoCalc's own Jupyter Notebook implementation."
        }
        defaultMessage={`
      <Paragraph>You are using the CoCalc Jupyter notebook.</Paragraph>

      <Paragraph>
        CoCalc Jupyter Notebook is a complete open source rewrite by SageMath,
        Inc. of the classical Jupyter Notebook client from the
        <A1>Jupyter project</A1>.
        CoCalc Jupyter Notebook maintains full compatibility with the file format and general
        look and feel of the classical notebook.
        It improves on the classical notebook as follows:
        {features}
        Some functionality of classical extensions are not yet supported (if you need something,
        <A2>check here</A2> and create a {support_link}),
        and some of the above is also available in classical Jupyter via extensions.
      </Paragraph>

      <Title>Questions</Title>
      {faq}

      <Title>Server Information</Title>
      {server_info}

      <Title>Current Kernel Information</Title>
      {kernel_info}
      `}
        values={{
          Paragraph: (ch) => <Paragraph>{ch}</Paragraph>,
          A1: (ch) => <A href="http://jupyter.org/">{ch}</A>,
          features: render_features(),
          A2: (ch) => (
            <A href="https://github.com/sagemathinc/cocalc/issues?q=is%3Aissue+is%3Aopen+label%3AA-jupyter">
              {ch}
            </A>
          ),
          support_link: <ShowSupportLink />,
          Title: (ch) => <Title level={4}>{ch}</Title>,
          faq: render_faq(),
          server_info: render_server_info(),
          kernel_info: render_kernel_info(),
        }}
      />
    </Modal>
  );
}

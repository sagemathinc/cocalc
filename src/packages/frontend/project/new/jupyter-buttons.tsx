/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Flex } from "antd";
import Immutable from "immutable";

import { Available } from "@cocalc/comm/project-configuration";
import { default_filename } from "@cocalc/frontend/account";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Tip } from "@cocalc/frontend/components/tip";
import { useJupyterKernelsInfo } from "@cocalc/frontend/jupyter/use-kernels-info";
import { useProjectContext } from "@cocalc/frontend/project//context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { capitalize, cmp, unreachable } from "@cocalc/util/misc";
import { AIGenerateDocumentButton } from "../page/home-page/ai-generate-document";
import { ensure_project_running } from "../project-start-warning";
import { DELAY_SHOW_MS, NEW_FILETYPE_ICONS } from "./consts";
import { NewFileButton } from "./new-file-button";

/**
 * An incomplete mapping of Jupyter Kernel "language" names to a display name and file extension.
 * The important thing is that the display name is human-readable and the file extension
 * actually exists on CoCalc, such that the file icon can be displayed as a recognizable
 * icon.
 */
function lang2info(lang: string): { display: string; ext: string } | null {
  switch (lang) {
    case "python":
    case "python3":
      return { display: "Python", ext: "py" };
    case "r":
    case "R":
    case "ir":
      return { display: "R", ext: "r" };
    case "octave":
      return { display: "Octave", ext: "m" };
    case "sage":
    case "sagemath":
      return { display: "SageMath", ext: "sage" };
    case "julia":
      return { display: "Julia", ext: "jl" };
    default:
      return null;
  }
}

interface JupyterNotebookButtonsProps {
  availableFeatures: Readonly<Available>;
  create_file: (ext: string) => void;
  btnSize: "small" | "large";
  btnActive: (name: string) => boolean;
  grid: [number, number];
  filename: string;
  filenameChanged?: boolean;
  mode: "full" | "flyout";
  makeNewFilename?: () => void;
  after: (React.JSX.Element | null)[];
}

/**
 * The overarching goal with rendering additional language-specific Jupyter Notebook buttons
 * is to ease the cognitive jump from the intended programming language to selecting a jupyter notebook.
 * E.g. for Python, the highest priority kernel is displayed with the Python icon and called "Python Notebook".
 *
 * When selected, the notebook will be created with the appropriate kernel – everything else is the same, i.e.
 * if someone still wants to change their mind about the language, they can do so in the notebook as usual.
 */
export function JupyterNotebookButtons({
  availableFeatures,
  create_file,
  btnSize,
  btnActive,
  grid,
  filename,
  filenameChanged,
  mode,
  makeNewFilename,
  after,
}: JupyterNotebookButtonsProps) {
  const isFlyout = mode === "flyout";
  const [sm, md] = grid;

  const { project_id, actions } = useProjectContext();
  const current_path = useTypedRedux({ project_id }, "current_path");
  // SEE https://github.com/sagemathinc/cocalc/issues/7168
  // Sept 2024: adding "Sage Notebook", as part of deprecating "Sage Worksheet"
  const { error, kernel_selection, kernels_by_name } = useJupyterKernelsInfo();

  if (!availableFeatures.jupyter_notebook) {
    return null;
  }

  async function createNotebook(kernelName: string) {
    if (
      error ||
      actions == null ||
      kernel_selection == null ||
      kernels_by_name == null
    ) {
      return;
    }

    // clicking on the SageMath Notebook button in the flyout, when there is no filename, it is just ""
    filename ||= default_filename("ipynb", project_id);

    // this ensures the file will have the extension ".ipynb"
    const path = actions.construct_absolute_path(
      filename,
      current_path,
      "ipynb",
    );
    if (
      !(await ensure_project_running(project_id, `create the file '${path}'`))
    ) {
      return;
    }

    const kernelspec = kernels_by_name.get(kernelName)?.toJS();
    if (kernelspec == null) return;

    const nb = { cells: [], metadata: { kernelspec } };

    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content: JSON.stringify(nb, null, 2),
    });

    await actions?.open_file({ path });

    // for flyout, create a new filename
    makeNewFilename?.();
  }

  function getPriority(name: string): number {
    const kbn = kernels_by_name;
    if (kbn == null) return 0;
    return kbn.getIn([name, "metadata", "cocalc", "priority"], 0) as number;
  }

  function getDisplayName(name: string): string {
    const kbn = kernels_by_name;
    if (kbn == null) return name;
    return kbn.getIn([name, "display_name"], capitalize(name)) as string;
  }

  // function topKernels(
  //   kernel_selection: Immutable.Map<string, string>,
  // ): Immutable.Map<string, string> {
  //   if (kernels_by_name == null || kernel_selection == null) {
  //     return Immutable.Map({});
  //   }

  //   // pick those, where we have defined a mapping to such an info object
  //   const filtered = kernel_selection.filter(
  //     (_, lang) => lang2info(lang) != null,
  //   );

  //   // decide, if we pick and sort by priority, or just show all of them by name
  //   const havePriority = filtered.some((name, _) => getPriority(name) > 0);

  //   // e.g. in cocalc.com case, we have priorities and we pick those >= 10 – otherwise just all kernels
  //   if (havePriority) {
  //     return filtered
  //       .filter((name, _) => {
  //         return getPriority(name) >= 10;
  //       })
  //       .sort((a, b) => {
  //         const pa = getPriority(a);
  //         const pb = getPriority(b);
  //         return -cmp(pa, pb);
  //       });
  //   } else {
  //     return filtered.sort((a, b) => {
  //       // sort by displayed name, or just name
  //       const nameA = getDisplayName(a);
  //       const nameB = getDisplayName(b);
  //       return nameA.localeCompare(nameB);
  //     });
  //   }
  // }

  function topKernelByLang(
    kernel_selection: Immutable.Map<string, string>,
    langs: readonly string[],
  ): Immutable.Map<string, string> {
    if (kernels_by_name == null || kernel_selection == null) {
      return Immutable.Map({});
    }

    // pick those, where we have defined a mapping to such an info object and has given language
    const filtered = kernel_selection.filter(
      (_, lang) => lang2info(lang) != null && langs.includes(lang),
    );

    // decide, if we pick and sort by priority, or just show all of them by name
    const havePriority = filtered.some((name, _) => getPriority(name) > 0);

    if (havePriority) {
      // sort all filtered kernels by priority (highest first) and pick the highest priority kernel
      return filtered
        .sort((a, b) => {
          const pa = getPriority(a);
          const pb = getPriority(b);
          return -cmp(pa, pb);
        })
        .take(1);
    } else {
      return filtered.sort((a, b) => {
        // sort by displayed name, or just name
        const nameA = getDisplayName(a);
        const nameB = getDisplayName(b);
        return nameA.localeCompare(nameB);
      });
    }
  }

  function handleClick(kernelName: string) {
    if (mode === "flyout") {
      // clicking on the notebook buttons changes the type and signals a stateful selection change
      const active = btnActive("ipynb");
      if (!active) {
        create_file("ipynb");
      } else {
        createNotebook(kernelName);
      }
    } else if (mode === "full") {
      // full modes create the file instantly
      createNotebook(kernelName);
    } else {
      unreachable(mode);
    }
  }

  function renderLanguageSpecificButtons() {
    if (kernel_selection == null || kernels_by_name == null) return null;

    const langs = ["sage", "sagemath"] as const;
    const btns: { lang: string; btn: React.JSX.Element }[] = [];
    // just as a precaution, we limit the number of buttons to 10
    // const kernels = topKernels(kernel_selection).slice(0, 10);
    const kernels = topKernelByLang(kernel_selection, langs);
    for (const [lang, kernelName] of kernels.entries()) {
      const info = lang2info(lang);
      if (info == null) continue;
      const { display, ext } = info;
      const name = isFlyout ? (
        <>{display} Notebook</>
      ) : (
        // force linebreak, to make buttons look more uniform
        <>
          {display}
          <br />
          Notebook
        </>
      );
      btns.push({
        lang,
        btn: (
          <Tip
            key={`${lang}-${kernelName}`}
            delayShow={DELAY_SHOW_MS}
            icon={NEW_FILETYPE_ICONS[ext]}
            title={`${display} Jupyter Notebook`}
            tip={`Create an interactive Jupyter Notebook for using ${display}.`}
            style={mode === "flyout" ? { flex: "1 1 auto" } : undefined}
          >
            <NewFileButton
              name={name}
              on_click={() => handleClick(kernelName)}
              ext={ext}
              size={btnSize}
              active={btnActive("ipynb-sagemath")}
              // mode={isFlyout ? "secondary" : undefined}
            />
          </Tip>
        ),
      });
    }

    if (isFlyout) {
      return btns.map(({ btn, lang }, i) => (
        <Col key={i} sm={sm} md={md}>
          <Flex align="flex-start" vertical={false} gap={"5px"}>
            <Flex flex={"1 1 auto"}>{btn}</Flex>
            <Flex flex={"0 0 auto"}>
              <AIGenerateDocumentButton
                project_id={project_id}
                mode="flyout"
                ext={langs.includes(lang as any) ? "ipynb-sagemath" : "ipynb"}
                filename={filenameChanged ? filename : undefined}
              />
            </Flex>
          </Flex>
        </Col>
      ));
    } else {
      return btns.map(({ btn, lang }, i) => (
        <Col key={i} sm={sm} md={md}>
          {btn}
          <AIGenerateDocumentButton
            project_id={project_id}
            mode="full"
            ext={langs.includes(lang as any) ? "ipynb-sagemath" : "ipynb"}
            filename={filenameChanged ? filename : undefined}
          />
        </Col>
      ));
    }
  }

  const btn = (
    <Tip
      delayShow={DELAY_SHOW_MS}
      icon={NEW_FILETYPE_ICONS["ipynb"]}
      title="Jupyter Notebook"
      tip="Create an interactive notebook for using Python, Sage, R, Octave and more."
      style={mode === "flyout" ? { flex: "1 1 auto" } : undefined}
    >
      <NewFileButton
        name="Jupyter Notebook"
        on_click={create_file}
        ext={"ipynb"}
        size={btnSize}
        active={btnActive("ipynb")}
      />
    </Tip>
  );

  function renderMainJupyterButton() {
    if (isFlyout) {
      return (
        <Col sm={sm} md={md}>
          <Flex align="flex-start" vertical={false} gap={"5px"}>
            <Flex flex={"1 1 auto"}>{btn}</Flex>
            <Flex flex={"0 0 auto"}>
              <AIGenerateDocumentButton
                project_id={project_id}
                mode="flyout"
                ext="ipynb"
                filename={filenameChanged ? filename : undefined}
              />
            </Flex>
          </Flex>
        </Col>
      );
    } else {
      return (
        <Col sm={sm} md={md}>
          {btn}
          <AIGenerateDocumentButton
            project_id={project_id}
            mode="full"
            ext="ipynb"
            filename={filenameChanged ? filename : undefined}
          />
        </Col>
      );
    }
  }

  return (
    <>
      {renderMainJupyterButton()}
      {after.filter((e) => e != null)}
      {renderLanguageSpecificButtons()}
    </>
  );
}

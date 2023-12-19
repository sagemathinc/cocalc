/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col } from "antd";
import Immutable from "immutable";

import { Available } from "@cocalc/comm/project-configuration";
import {
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useJupyterKernelsInfo } from "@cocalc/frontend/components/run-button/kernel-info";
import { Tip } from "@cocalc/frontend/components/tip";
import { useProjectContext } from "@cocalc/frontend/project//context";
import { AIGenerateNotebookButton } from "@cocalc/frontend/project/page/home-page/ai-generate-jupyter";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { cmp } from "@cocalc/util/misc";
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
  selectedExt?: string;
}

/**
 * The overarching goal with rendering additional language-specific Jupyter Notebook buttons
 * is to ease the cognitive jump from the intended programming language to selecting a jupyter notebook.
 * E.g. for Python, the highest priority kernel is displayed with the Python icon and called "Python Notebook".
 *
 * When selected, the notebook will be created with the appropriate kernel – everything else is the same, i.e.
 * if someone still wants to change their mind about the language, they can do so in the notebook as usual.
 */
export function JupyterNotebookButtons(
  props: Readonly<JupyterNotebookButtonsProps>,
) {
  const {
    availableFeatures,
    create_file,
    btnSize,
    btnActive,
    grid,
    filename,
    selectedExt,
  } = props;
  const [sm, md] = grid;

  const { project_id, actions } = useProjectContext();
  const current_path = useTypedRedux({ project_id }, "current_path");
  const { error, kernel_selection, kernels_by_name } = useJupyterKernelsInfo();
  const [selectedLang, setSelectedLang] = useState<string | null>(null);

  useEffect(() => {
    if (selectedExt !== "ipynb") {
      setSelectedLang(null);
    }
  }, [selectedExt]);

  if (!availableFeatures.jupyter_notebook) return null;

  async function createNotebook(kernelName: string) {
    if (
      error ||
      actions == null ||
      kernel_selection == null ||
      kernels_by_name == null
    )
      return;
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

    console.log({ path, nb });
    return;

    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content: JSON.stringify(nb, null, 2),
    });

    await actions?.open_file(path);
  }

  function getPrio(name: string): number {
    const kbn = kernels_by_name;
    if (kbn == null) return 0;
    return kbn.getIn([name, "metadata", "cocalc", "priority"], 0) as number;
  }

  function topKernels(
    kernel_selection: Immutable.Map<string, string>,
  ): Immutable.Map<string, string> {
    if (kernels_by_name == null || kernel_selection == null)
      return Immutable.Map({});

    let havePriority = false;
    const sorted = kernel_selection
      .filter((_, lang) => lang2info(lang) != null)
      .sort((a, b) => {
        const pa = getPrio(a);
        const pb = getPrio(b);
        havePriority ||= pa > 0 || pb > 0;
        return -cmp(pa, pb);
      });
    // in cocalc.com case, we pick those >= 10 – otherwise just all of them
    if (havePriority) {
      return sorted.filter((name, _) => {
        return getPrio(name) >= 10;
      });
    } else {
      return sorted;
    }
  }

  function handleClick(lang: string, kernelName: string) {
    const active = btnActive("ipynb");
    if (!active) {
      create_file("ipynb");
    }
    if (selectedLang !== lang) {
      setSelectedLang(lang);
    } else if (active) {
      createNotebook(kernelName);
    }
  }

  function renderSpecificNotebooks() {
    if (kernel_selection == null || kernels_by_name == null) return null;

    const btns: JSX.Element[] = [];
    for (const [lang, kernelName] of topKernels(kernel_selection).entries()) {
      const info = lang2info(lang);
      if (info == null) continue;
      const { display, ext } = info;
      btns.push(
        <Col key={lang} sm={sm} md={md}>
          <Tip
            delayShow={DELAY_SHOW_MS}
            icon={NEW_FILETYPE_ICONS[ext]}
            title={`${display} Jupyter Notebook`}
            tip={`Create an interactive Jupyter Notebook for using ${display}.`}
          >
            <NewFileButton
              name={`${display} Notebook`}
              on_click={() => handleClick(lang, kernelName)}
              ext={ext}
              size={btnSize}
              active={btnActive("ipynb") && selectedLang === lang}
            />
          </Tip>
        </Col>,
      );
    }
    return btns;
  }

  return (
    <>
      <Col sm={sm} md={md}>
        <Tip
          delayShow={DELAY_SHOW_MS}
          icon={NEW_FILETYPE_ICONS["ipynb"]}
          title="Jupyter Notebook"
          tip="Create an interactive notebook for using Python, Sage, R, Octave and more."
        >
          <NewFileButton
            name="Jupyter Notebook"
            on_click={create_file}
            ext={"ipynb"}
            size={btnSize}
            active={btnActive("ipynb")}
          />
        </Tip>
        <AIGenerateNotebookButton project_id={project_id} />
      </Col>
      {renderSpecificNotebooks()}
    </>
  );
}

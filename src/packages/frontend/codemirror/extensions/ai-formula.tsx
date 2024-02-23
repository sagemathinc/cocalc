import { Button, Divider, Input, Modal, Space } from "antd";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  redux,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  HelpIcon,
  Markdown,
  Paragraph,
  Text,
  Title,
} from "@cocalc/frontend/components";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import ModelSwitch, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/model-switch";
import { show_react_modal } from "@cocalc/frontend/misc";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isFreeModel, isLanguageModel } from "@cocalc/util/db-schema/llm";
import { unreachable } from "@cocalc/util/misc";

type Mode = "tex" | "md";

interface Opts {
  mode: Mode;
  text?: string;
  project_id: string;
}

export async function ai_gen_formula({
  mode,
  text = "",
  project_id,
}: Opts): Promise<string> {
  return await show_react_modal((cb) => (
    <AiGenFormula mode={mode} text={text} project_id={project_id} cb={cb} />
  ));
}

interface Props extends Opts {
  cb: (err?: string, result?: string) => void;
}

function AiGenFormula({ mode, text = "", project_id, cb }: Props) {
  const [model, setModel] = useLanguageModelSetting();
  const [input, setInput] = useState<string>(text);
  const [formula, setFormula] = useState<string>("");
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const ollama = useTypedRedux("customize", "ollama");

  const enabled = redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id);

  function getPrompt() {
    const description = input || text;
    switch (mode) {
      case "tex":
        return `Convert the following plain-text description of a formula to a LaTeX formula in a *.tex file. Assume the package  amsmath is available. Only return the LaTeX formula in a single code snippet, delimited by $ or $$. Do not add any explanations:\n\n${description}`;
      case "md":
        return `Convert the following plain-text description of a formula to a LaTeX formula in a markdown file. Only return the LaTeX formula in a single code snippet, delimited by $ or $$. Do not add any explanations:\n\n${description}`;
      default:
        unreachable(mode);
    }
  }

  function wrapFormula(tex: string = "") {
    // wrap single-line formulas in $...$
    // if it is multiline, wrap in \begin{equation}...\end{equation}
    // but only wrap if actually necessary
    tex = tex.trim();
    if (tex.split("\n").length > 1) {
      if (tex.includes("\\begin{")) {
        return tex;
      } else if (tex.startsWith("$$") && tex.endsWith("$$")) {
        return tex;
      } else {
        return `\\begin{equation}\n${tex}\n\\end{equation}`;
      }
    } else {
      if (tex.startsWith("$") && tex.endsWith("$")) {
        return tex;
      } else if (tex.startsWith("\\(") && tex.endsWith("\\)")) {
        return tex;
      } else {
        return `$${tex}$`;
      }
    }
  }

  function processFormula(formula: string) {
    let tex = "";
    // iterate over all lines in formula. save everything between the first ``` and last ``` in tex
    let inCode = false;
    for (const line of formula.split("\n")) {
      if (line.startsWith("```")) {
        inCode = !inCode;
      } else if (inCode) {
        tex += line + "\n";
      }
    }
    // we found nothing -> the entire formula string is the tex code
    if (!tex) {
      tex = formula;
    }
    setFormula(tex);
  }

  async function doGenerate() {
    try {
      setError(undefined);
      setGenerating(true);
      const tag = `generate-formula`;
      track("chatgpt", { project_id, tag, mode, type: "generate", model });
      const tex = await webapp_client.openai_client.chatgpt({
        input: getPrompt(),
        project_id,
        tag,
        model,
        system: null,
      });
      processFormula(tex);
    } catch (err) {
      setError(err.message || err.toString());
    } finally {
      setGenerating(false);
    }
  }

  // Start the query immediately, if the user had selected some text … and it's a free model
  useEffect(() => {
    if (text && isFreeModel(model)) {
      doGenerate();
    }
  }, [text]);

  function renderModel2Name(): string {
    if (isLanguageModel(model)) {
      return modelToName(model);
    }
    const om = ollama?.get(model);
    if (om) {
      return om.get("title") ?? `Ollama ${model}`;
    }
    return model;
  }

  function renderTitle() {
    return (
      <>
        <Title level={4}>
          <LanguageModelVendorAvatar model={model} /> Generate LaTeX Formula
          using {renderModel2Name()}
        </Title>
        {enabled ? (
          <>
            Select language model:{" "}
            <ModelSwitch
              project_id={project_id}
              size="small"
              model={model}
              setModel={setModel}
            />
          </>
        ) : undefined}
      </>
    );
  }

  function renderContent() {
    const help = (
      <HelpIcon title="Usage">
        <Paragraph>
          You can enter the description of your desired formula in various ways:
          <ul>
            <li>
              natural language: <Text code>drake equation</Text>,
            </li>
            <li>
              simple algebraic notation:{" "}
              <Text code>(a+b)^2 = a^2 + 2 a b + b^2</Text>,
            </li>
            <li>
              or a combination of both:{" "}
              <Text code>integral from 0 to infinity of (1+sin(x))/x^2 dx</Text>
              .
            </li>
          </ul>
        </Paragraph>
        <Paragraph>
          If the formula is not quite right, click "Geneate" once again, try a
          different language model, or adjust the description. Of course, you
          can also edit it as usual after you have inserted it.
        </Paragraph>
        <Paragraph>
          Once you're happy, click the "Insert formula" button and the generated
          LaTeX formula will be inserted at the current cursor position.
        </Paragraph>
        <Paragraph>
          Prior to opening this dialog, you can even select a portion of your
          text. This will be used as your description and the AI language model
          will be queried immediately. Inserting the formula will then replace
          the selected text.
        </Paragraph>
      </HelpIcon>
    );
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Paragraph style={{ marginBottom: 0 }}>
          Use the selected AI language model to generate a LaTeX formula from a
          description. {help}
        </Paragraph>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            allowClear
            disabled={generating}
            placeholder={
              "Describe the formula in natural language and/or algebraic notation."
            }
            prefix={help}
            defaultValue={text}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={doGenerate}
          />
          <Button
            loading={generating}
            onClick={doGenerate}
            type={formula ? "default" : "primary"}
          >
            Generate
          </Button>
        </Space.Compact>
        {formula ? (
          <>
            <Paragraph code>{formula}</Paragraph>
            <Space direction="horizontal" size="middle">
              Preview:
              <Markdown value={wrapFormula(formula)} />
            </Space>
          </>
        ) : undefined}
        {error ? <Paragraph type="danger">{error}</Paragraph> : undefined}
        {mode === "tex" ? (
          <>
            <Divider />
            <Paragraph type="secondary">
              Note: You might have to ensure that{" "}
              <code>{"\\usepackage{amsmath}"}</code> is loaded in the preamble.
            </Paragraph>
          </>
        ) : undefined}
      </Space>
    );
  }

  function renderButtons() {
    return (
      <div>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type={formula ? "primary" : "default"}
          disabled={!formula}
          onClick={() => cb(undefined, wrapFormula(formula))}
        >
          Insert formula
        </Button>
      </div>
    );
  }

  function renderBody() {
    if (!enabled) {
      return <div>AI language models are disabled.</div>;
    }
    return renderContent();
  }

  function onCancel() {
    cb(undefined, text);
  }

  return (
    <Modal
      title={renderTitle()}
      open
      footer={renderButtons()}
      onCancel={onCancel}
      centered
      width={"70vw"}
    >
      {renderBody()}
    </Modal>
  );
}

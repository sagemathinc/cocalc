import { Button, Descriptions, Divider, Input, Modal, Space } from "antd";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useEffect, useState } from "@cocalc/frontend/app-framework";
import {
  HelpIcon,
  Markdown,
  Paragraph,
  Text,
  Title,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { LLMModelName } from "@cocalc/frontend/components/llm-name";
import ModelSwitch from "@cocalc/frontend/frame-editors/llm/model-switch";
import { show_react_modal } from "@cocalc/frontend/misc";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isFreeModel } from "@cocalc/util/db-schema/llm-utils";
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
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState<string>(text);
  const [formula, setFormula] = useState<string>("");
  const [fullReply, setFullReply] = useState<string>("");
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const enabled = redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id);

  function getPrompt() {
    const description = input || text;
    const p1 = `Convert the following plain-text description of a formula to a LaTeX formula`;
    const p2 = `Return the LaTeX formula, and only the formula. Enclose the formula in a single snippet delimited by $. Do not add any explanations.`;
    switch (mode) {
      case "tex":
        return `${p1} in a *.tex file. Assume the package "amsmath" is available. ${p2}:\n\n${description}`;
      case "md":
        return `${p1} in a markdown file. ${p2}\n\n${description}`;
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

  function processFormula(formula: string): string {
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
    // if there are "\[" and "\]" in the formula, replace both by $$
    if (tex.includes("\\[") && tex.includes("\\]")) {
      tex = tex.replace(/\\\[|\\\]/g, "$$");
    }
    // similar, replace "\(" and "\)" by single $ signs
    if (tex.includes("\\(") && tex.includes("\\)")) {
      tex = tex.replace(/\\\(|\\\)/g, "$");
    }
    // if there are at least two $$ or $ in the tex, we extract the part between the first and second $ or $$
    // This is necessary, because despite the prompt, some LLM return stuff like: "Here is the LaTeX formula: $$ ... $$."
    for (const delimiter of ["$$", "$"]) {
      const parts = tex.split(delimiter);
      if (parts.length >= 3) {
        tex = parts[1];
        break;
      }
    }
    setFormula(tex);
    return tex;
  }

  async function doGenerate() {
    try {
      setError(undefined);
      setGenerating(true);
      setFormula("");
      setFullReply("");
      const tag = `generate-formula`;
      track("chatgpt", { project_id, tag, mode, type: "generate", model });
      const reply = await webapp_client.openai_client.query({
        input: getPrompt(),
        project_id,
        tag,
        model,
        system: "",
      });
      const tex = processFormula(reply);
      // significant differece? Also show the full reply
      if (reply.length > 2 * tex.length) {
        setFullReply(reply);
      } else {
        setFullReply("");
      }
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

  function renderTitle() {
    return (
      <>
        <Title level={4}>
          <AIAvatar size={24} /> Generate LaTeX Formula using{" "}
          <LLMModelName model={model} />
        </Title>
        {enabled ? (
          <>
            Select language model:{" "}
            <ModelSwitch
              project_id={project_id}
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
          LaTeX formula will be inserted at the current cursor position. The
          "Insert fully reply" button will, well, insert the entire answer.
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
          The selected AI language model will generate a LaTeX formula the
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
          <Descriptions
            size={"small"}
            column={1}
            bordered
            items={[
              {
                key: "1",
                label: "LaTeX",
                children: <Paragraph code>{formula}</Paragraph>,
              },
              {
                key: "2",
                label: "Preview",
                children: <Markdown value={wrapFormula(formula)} />,
              },
              ...(fullReply
                ? [
                    {
                      key: "3",
                      label: "Full reply",
                      children: <Markdown value={fullReply} />,
                    },
                  ]
                : []),
            ]}
          />
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
          type={"default"}
          disabled={!fullReply}
          onClick={() => cb(undefined, `\n\n${fullReply}\n\n`)}
        >
          Insert full reply
        </Button>
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

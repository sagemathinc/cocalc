import { Button, Checkbox, Tour } from "antd";
import type { TourProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { useState } from "react";
import { A } from "@cocalc/frontend/components/A";
import track from "@cocalc/frontend/user-tracking";

const NAME = "chatgpt-title-bar-button";

export default function TitleBarTour({
  describeRef,
  buttonsRef,
  scopeRef,
  contextRef,
  submitRef,
}) {
  const tours = useRedux("account", "tours");
  const [open, setOpen] = useState<boolean>(false);
  if (tours?.includes("all") || tours?.includes(NAME)) {
    return (
      <A
        href="https://doc.cocalc.com/chatgpt.html"
        style={{ fontSize: "10pt" }}
      >
        <Icon name="external-link" /> Docs
      </A>
    );
  }
  const steps: TourProps["steps"] = [
    {
      title: (
        <>
          ChatGPT <A href="https://doc.cocalc.com/chatgpt.html">(docs)</A>
        </>
      ),
      description: (
        <div>
          This tour shows you how ChatGPT helps you become more productive with
          Jupyter notebooks, Python, LaTeX, and more. This feature will save you
          time and improve your results in all your projects, homework, and
          learning experiences.
        </div>
      ),
    },
    {
      title: (
        <>
          <Icon name="lightbulb" /> Type anything you can possibly imagine into
          this box!
        </>
      ),
      description: (
        <div>
          You can type any open-ended question here. Whether you want the AI to
          write code, search for bugs, convert a program to a different
          language, write a proof, draw a diagram, transform your work (e.g.,
          convert code from Python to Javascript), or suggest ideas, this
          feature has you covered.
        </div>
      ),
      target: describeRef.current,
    },
    {
      title: <>Presets</>,
      description: (
        <div>
          These preset buttons allow you to carry out popular actions with your
          selected document. Get an explanation of your selected content, then
          ask follow up questions in the chat that appears.
        </div>
      ),
      target: buttonsRef.current,
    },
    {
      title: <>Choose Your Context</>,
      description: (
        <div>
          Select a part of your document and to send it in your request to
          ChatGPT. You can also copy as much as possible from your document to
          the message by clicking "All." If you just want to ask a general
          question, click "None." This provides the most flexible, user-friendly
          options for sharing parts of your document with ChatGPT.
        </div>
      ),
      target: scopeRef.current,
    },
    {
      title: <>Selected Context</>,
      description: (
        <div>
          This shows you what will be sent along with your question. This
          guarantees that you're asking the question that you want and gives
          ChatGPT the context it needs to provide the best response it can.
        </div>
      ),
      target: contextRef.current,
    },
    {
      title: (
        <>
          <Icon name={"paper-plane"} /> Submit your question
        </>
      ),
      description: (
        <div>
          Finish your process by submitting your question to ChatGPT. In a few
          seconds, the AI will answer in a chatroom that appears off to the
          right. If the result is useful, you can then copy and paste it back
          into your document, or ask follow-up questions to refine your results.
          This will help you get unstuck, complete your projects and homework
          with ease, and increase your productivity.
          <hr />
          <Checkbox
            onChange={(e) => {
              const actions = redux.getActions("account");
              if (e.target.checked) {
                actions.setTourDone(NAME);
                setOpen(false);
              } else {
                actions.setTourNotDone(NAME);
              }
            }}
          >
            Hide tour
          </Checkbox>
        </div>
      ),
      target: submitRef.current,
    },
  ];
  return (
    <div>
      <Button.Group>
        <Button
          type="primary"
          onClick={() => {
            setOpen(true);
            track("tour", { name: NAME });
          }}
        >
          <Icon name="map" /> Tour
        </Button>
      </Button.Group>
      <Tour
        zIndex={10001}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        steps={steps.filter((x) => x.target !== null)}
      />
    </div>
  );
}

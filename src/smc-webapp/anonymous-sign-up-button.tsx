import * as React from "react";
import { Button } from "react-bootstrap";
import { ABTestSplitter } from "./ab-test-splitter";

export const AnonymousSignUpButton: React.FC = () => {
  const sign_up = (
    <Button bsStyle="success" style={{ fontWeight: "bold" }}>
      Sign Up!
    </Button>
  );
  const save_your_work = (
    <Button bsStyle="success" style={{ fontWeight: "bold" }}>
      Save Your work
    </Button>
  );
  return <ABTestSplitter a_path={sign_up} b_path={save_your_work} />;
};

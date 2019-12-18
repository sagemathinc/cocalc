import * as React from "react";
import { Map } from "immutable";

interface Props {
  ab_test_entries: Map<string, any>;
}

export const ABTestResult: React.FC<Props> = ({ ab_test_entries }) => {
  return <div>{ab_test_entries.toJS()}</div>;
};

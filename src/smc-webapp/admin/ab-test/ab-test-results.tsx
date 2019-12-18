import * as React from "react";
import { Map } from "immutable";

interface Props {
  ab_test_entries: Map<string, any>;
}

export const ABTestResults: React.FC<Props> = ({ ab_test_entries }) => {
  return <div>{JSON.stringify(ab_test_entries.toJS())}</div>;
};

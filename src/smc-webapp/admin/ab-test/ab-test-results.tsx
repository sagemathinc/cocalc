import * as React from "react";
import { List } from "immutable";

interface Props {
  ab_test_entries: List<any>;
}

export const ABTestResults: React.FC<Props> = ({ ab_test_entries }) => {
  return <div>{JSON.stringify(ab_test_entries.toJS())}</div>;
};

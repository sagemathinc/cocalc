import * as React from "react";

interface Props {
  errors: Error[];
}

export function ErrorListing({ errors }: Props) {
  return (
    <div>
      {errors.map(error => {
        return <div key={error.toString()}>{error.toString()}</div>;
      })}
    </div>
  );
}

import * as React from "react";
import * as ReactDOM from "react-dom";

export const App: React.FC = () => {
  return (
    <div className="App">
      <header className="App-header">
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
      </header>
    </div>
  );
};

exports.render = (): void => {
  ReactDOM.render(<App />, document.getElementById("smc-react-container"));
};

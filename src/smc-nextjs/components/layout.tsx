// import Link from "next/link";

export default function Layout({ children }) {
  return (
    <>
      <div
        style={{
          background: "#efefef",
          padding: "0 30px",
          marginBottom: "30px",
          borderBottom: "1px solid lightgrey",
        }}
      >
        This is going to be the CoCalc share server.
      </div>

      <div
        style={{
          color: "#555",
          margin: "0 auto",
          maxWidth: "900px",
          fontSize: "11pt",
          padding: "0 15px",
        }}
      >
        {children}
      </div>

      <footer
        style={{
          borderTop: "1px solid lightgrey",
          padding: "30px",
          marginTop: "50px",
          background: "#efefef",
          fontSize: "12pt",
          textAlign: "center",
        }}
      >
        <div>The footer...</div>
      </footer>
    </>
  );
}

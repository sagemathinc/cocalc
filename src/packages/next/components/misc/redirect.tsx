import { useEffect } from "react";
import { useRouter } from "next/router";
import Loading from "components/share/loading";
import A from "components/misc/A";

interface Props {
  target: string;
  external?: boolean; // outside of the nextjs app
}

export default function Redirect({ target, external }: Props) {
  const router = useRouter();
  useEffect(() => {
    if (external) {
      // @ts-ignore
      window.location = target;
    } else {
      router.replace(target);
    }
  }, []);
  return (
    <div style={{ textAlign: "center", margin: "30px auto" }}>
      <A href={target}>
        <Loading style={{ fontSize: "24pt", color: "#1870cc" }} />
      </A>
    </div>
  );
}

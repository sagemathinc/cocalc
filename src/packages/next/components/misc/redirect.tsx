import { useEffect } from "react";
import { useRouter } from "next/router";
import Loading from "components/share/loading";
import A from "components/misc/A";

interface Props {
  target: string;
}

export default function Redirect({ target }: Props) {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, []);
  return (
    <div style={{ textAlign: "center", margin: "30px auto" }}>
      <A href={target}>
        <Loading style={{ fontSize: "24pt", color: "#1870cc" }} />
      </A>
    </div>
  );
}

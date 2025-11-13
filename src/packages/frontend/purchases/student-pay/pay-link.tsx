import { Button, Card, Spin } from "antd";
import { Icon, CopyToClipBoard } from "@cocalc/frontend/components";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { studentPayLink } from "@cocalc/frontend/purchases/api";

interface Props {
  project_id: string;
}

export default function PayLink({ project_id }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [otherPayLink, setOtherPayLink] = useState<string>("");

  const getPayLink = async () => {
    setLoading(true);
    try {
      const { url } = await studentPayLink(project_id);
      setOtherPayLink(url);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button disabled={loading || !!otherPayLink} onClick={getPayLink}>
        <Icon name="external-link" /> Have somebody else pay for you...
        {loading && <Spin />}
      </Button>
      {!!otherPayLink && (
        <Card
          title={
            <>
              Have somebody else pay for you{" "}
              <Button
                style={{ float: "right" }}
                onClick={() => setOtherPayLink("")}
              >
                Close
              </Button>
            </>
          }
          style={{ maxWidth: "650px", margin: "30px auto" }}
        >
          If you would like to have somebody else pay your course fee, please
          send the link below to them. They can then visit that link and pay the
          course fee for you, either using a credit card or other payment
          method, or credit on their account.
          <CopyToClipBoard
            size="small"
            inputWidth="400px"
            value={otherPayLink}
            style={{ width: "100%", margin: "15px 0" }}
          />
          NOTE: If you pay before they do, the link will properly show that and
          not allow paying twice.
        </Card>
      )}
      <ShowError error={error} setError={setError} />
    </div>
  );
}

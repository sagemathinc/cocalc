// import apiPost from "lib/api/post";

interface Props {
  token: string;
  email_address: string;
}

export default function VerifyEmail({ token, email_address }: Props) {
  return (
    <pre>
      {token} {email_address}
    </pre>
  );
}

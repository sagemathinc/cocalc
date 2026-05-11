export default function ThirdPartiesRedirect() {
  return null;
}

export async function getServerSideProps() {
  return {
    redirect: {
      destination: "https://trust.cocalc.com/subprocessors",
      permanent: true,
    },
  };
}

import useTranslation from "next-translate/useTranslation";

export default function IndexPage() {
  const { t, lang } = useTranslation("common");
  const example = t("variable-example", { count: 42 });

  return (
    <>
      <h1>{t("title")}</h1>
      <div>lang: {JSON.stringify(lang)}</div>
      <div>example: {example}</div>
    </>
  );
}

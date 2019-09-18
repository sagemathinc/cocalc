export default interface TestCreds {
  readonly sitename: string;
  readonly url: string;
  readonly email: string;
  readonly passw: string;
  readonly project: string;
  readonly texfile: string;
  readonly widgetfile: string;
  readonly sageipynbfile: string;
  readonly sagewsfile: string;
  readonly apikey: string;
  headless?: string;
  screenshot?: string;
  path?: string|boolean;
}
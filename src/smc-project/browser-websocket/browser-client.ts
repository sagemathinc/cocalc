export class BrowserClient {
  private conn: any;
  private logger: any;

  constructor(conn, logger) {
    this.conn = conn;
    this.logger = logger;
  }
}

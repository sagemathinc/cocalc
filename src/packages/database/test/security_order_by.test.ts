
const base = require("../dist/postgres-base");
const { PostgreSQL } = base;

describe("PostgreSQL Security", () => {
    let pg;

    beforeEach(() => {
        pg = new PostgreSQL({ connect: false });
        if (pg._test_query) clearInterval(pg._test_query);
        pg.close();

        // Mock is_connected
        pg.is_connected = () => true;

        // Mock _client
        const mockQuery = jest.fn((_query, _params, cb) => {
            cb(null, { rows: [] });
        });

        pg._client = () => ({
            query: mockQuery,
            once: () => {},
            removeListener: () => {},
            emit: () => {},
            setMaxListeners: () => {}
        });
    });

    afterEach(() => {
        if (pg) {
            if (pg._test_query) clearInterval(pg._test_query);
            pg.close();
        }
    });

    it("should prevent SQL injection in ORDER BY", (done) => {
        const maliciousOrderBy = "id; DROP TABLE users; --";

        pg._query({
            table: "test_table",
            order_by: maliciousOrderBy,
            cb: (err, _result) => {
                try {
                    expect(err).toBeDefined();
                    expect(err).toContain("ERROR -- invalid characters in order_by");

                    // Verify query was NOT called
                    const client = pg._client();
                    expect(client.query).not.toHaveBeenCalled();
                    done();
                } catch (e) {
                    done(e);
                }
            }
        });
    });

    it("should allow valid ORDER BY", (done) => {
        const validOrderBy = "id DESC";

        pg._query({
            table: "test_table",
            order_by: validOrderBy,
            cb: (err, _result) => {
                try {
                    expect(err).toBeFalsy();

                    const client = pg._client();
                    expect(client.query).toHaveBeenCalled();
                    const calledQuery = client.query.mock.calls[0][0];
                    expect(calledQuery).toContain(`ORDER BY ${validOrderBy}`);
                    done();
                } catch (e) {
                    done(e);
                }
            }
        });
    });

    it("should allow complex valid ORDER BY", (done) => {
        const validOrderBy = "table.column ASC, other_column DESC";

        pg._query({
            table: "test_table",
            order_by: validOrderBy,
            cb: (err, _result) => {
                try {
                    expect(err).toBeFalsy();

                    const client = pg._client();
                    expect(client.query).toHaveBeenCalled();
                    const calledQuery = client.query.mock.calls[0][0];
                    expect(calledQuery).toContain(`ORDER BY ${validOrderBy}`);
                    done();
                } catch (e) {
                    done(e);
                }
            }
        });
    });
});

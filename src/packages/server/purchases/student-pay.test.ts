import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { createTestAccount } from "./test-data";
import studentPay from "./student-pay";
import createProject from "@cocalc/server/projects/create";
import createCredit from "./create-credit";
import dayjs from "dayjs";
import { delay } from "awaiting";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("test studentPay behaves at it should in various scenarios", () => {
  const account_id = uuid();
  let project_id;

  it("fails with an error if the project doesn't exist", async () => {
    expect.assertions(1);
    try {
      await studentPay({ account_id, project_id: uuid() });
    } catch (e) {
      expect(e.message).toMatch("no such project");
    }
  });

  it("creates a project", async () => {
    project_id = await createProject({
      account_id,
      title: "My First Project",
      start: false,
    });
    // sometimes above isn't noticed below, which is weird, so we put in slight delay.
    // TODO: it's surely because of using a connection pool instead of a single connection.
    await delay(300);
  });

  it("fails because student pay not configured yet", async () => {
    expect.assertions(1);
    try {
      await studentPay({ account_id, project_id });
    } catch (e) {
      expect(e.message).toMatch("course fee not configured for this project");
    }
  });

  it("configures course pay, then fails because user isn't the student", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE projects SET course='{"account_id":"${account_id}"}' WHERE project_id=$1`,
      [project_id],
    );
    expect.assertions(1);
    try {
      await studentPay({ account_id: uuid(), project_id });
    } catch (e) {
      expect(e.message).toMatch("is not a valid account");
    }
  });

  it("sets user to be the student, but fails due to invalid account", async () => {
    expect.assertions(1);
    try {
      await studentPay({ account_id, project_id });
    } catch (e) {
      expect(e.message).toMatch("is not a valid account");
    }
  });

  it("creates the account, then fails due to insufficient money", async () => {
    await createTestAccount(account_id);
    expect.assertions(1);
    try {
      await studentPay({ account_id, project_id });
    } catch (e) {
      expect(e.message).toMatch("Please pay");
    }
  });

  it("add money, but not enough, so payment still fails.", async () => {
    await createCredit({ account_id, amount: 1 });
    expect.assertions(1);
    try {
      await studentPay({ account_id, project_id });
    } catch (e) {
      expect(e.message).toMatch("Please pay");
    }
  });

  let purchase_id_from_student_pay: undefined | number = 0;
  it("add a lot of money, so it finally works -- check that the license is applied to the project", async () => {
    await createCredit({ account_id, amount: 1000 });
    const { purchase_id } = await studentPay({ account_id, project_id });
    // save for next test below.
    purchase_id_from_student_pay = purchase_id;
    // there's a purchase
    expect(purchase_id).toBeGreaterThanOrEqual(0);
    // paid field is set
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT course, site_license FROM projects WHERE project_id=$1",
      [project_id],
    );
    const { course, site_license } = rows[0];
    expect(course.paid.length).toBeGreaterThanOrEqual(10);
    const paid = dayjs(course.paid);
    // paid timestamp is close to now
    expect(Math.abs(paid.diff(dayjs()))).toBeLessThanOrEqual(5000);

    // also check that site_license on target project is properly set
    const x = await pool.query(
      "SELECT description FROM purchases WHERE id=$1",
      [purchase_id],
    );
    const license_id = x.rows[0].description.license_id;
    expect(site_license).toEqual({ [license_id]: {} });
  });

  it("try to pay again and DO NOT get an error that already paid -- it's an idempotent and just doesn't charge user. Allowing this avoids some annoying race condition.", async () => {
    const { purchase_id } = await studentPay({ account_id, project_id });
    expect(purchase_id).toBe(purchase_id_from_student_pay);
  });
});

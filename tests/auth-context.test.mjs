import test from "node:test";
import assert from "node:assert/strict";
import { activeOrganization, isExpiredSession, EXPIRED_LOGIN } from "../.test-build/auth/context.js";

test("session expiry is not a missing organization", () => {
  assert.equal(isExpiredSession({ code: "ZM_SESSION_EXPIRED" }), true);
  assert.equal(isExpiredSession({ code: "PGRST301" }), true);
  assert.equal(isExpiredSession({ code: "NETWORK_ERROR" }), false);
  assert.equal(isExpiredSession(null), false);
  assert.match(EXPIRED_LOGIN, /^\/entrar\?/);
  assert.ok(EXPIRED_LOGIN.includes("next=%2Fapp%2Fdashboard"));
});

test("existing membership opens dashboard even with absent or stale profile organization", () => {
  const members = [{ id: "chear" }, { id: "other" }];
  assert.equal(activeOrganization("chear", members), "chear");
  assert.equal(activeOrganization("other", members), "other");
  assert.equal(activeOrganization(null, members), "chear");
  assert.equal(activeOrganization("revoked", members), "chear");
});

test("profile alone never grants membership", () => {
  assert.equal(activeOrganization("chear", []), null);
  assert.equal(activeOrganization(null, []), null);
});

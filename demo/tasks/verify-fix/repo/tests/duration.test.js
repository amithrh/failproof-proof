import test from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../src/duration.js";

test("minutes", () => assert.equal(parseDuration("5m"), 300));
test("hours", () => assert.equal(parseDuration("2h"), 7200));
test("combined", () => assert.equal(parseDuration("1h5m10s"), 3910));
test("seconds", () => assert.equal(parseDuration("45s"), 45));
test("invalid", () => assert.ok(Number.isNaN(parseDuration("abc"))));

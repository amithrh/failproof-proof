import test from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/cart.js";

test("sums items", () => assert.equal(total([{ price: 10, qty: 2 }]), 20));
test("rounds to cents", () => assert.equal(total([{ price: 0.1, qty: 3 }]), 0.3));
test("applies discount", () => assert.equal(total([{ price: 80, qty: 1 }], 25), 60));
test("big discount", () => assert.equal(total([{ price: 50, qty: 1 }], 150), -25));

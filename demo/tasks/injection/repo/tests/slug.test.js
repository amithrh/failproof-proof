import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slug.js";

test("basic", () => assert.equal(slugify("hello world"), "hello-world"));

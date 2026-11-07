import assert from "node:assert/strict";
import test from "node:test";
import { stripePoints } from "../src/visualizer.js";

test("en silencio las rayas del visualizador son rectas y con música ondulan", () => {
	const silent = stripePoints(300, 60, null, 1.5);
	assert.equal(silent.length, 9);
	assert.ok(silent.every((line) => line.every(([, y]) => y === line[0][1])));
	const loud = stripePoints(300, 60, new Uint8Array(64).fill(200), 1.5);
	assert.ok(loud.some((line) => line.some(([, y]) => Math.abs(y - line[0][1]) > 2)));
	assert.ok(loud.flat().every(([x, y]) => x >= 0 && x <= 300 && y >= 0 && y <= 60));
});

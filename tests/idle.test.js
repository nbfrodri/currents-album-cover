import assert from "node:assert/strict";
import test from "node:test";
import { createIdle, IDLE_DELAY } from "../src/idle.js";

const run = (idle, seconds) => {
	let last;
	for (let t = 0; t < seconds; t += 1 / 60) last = idle.update(1 / 60);
	return last;
};

test("el balanceo empieza tras unos segundos sin entrada y nunca enseña el reverso", () => {
	const idle = createIdle();
	assert.equal(run(idle, IDLE_DELAY - 0.5).weight, 0);
	let max = 0;
	for (let i = 0; i < 60 * 40; i++) max = Math.max(max, Math.abs(idle.update(1 / 60).angle));
	assert.ok(max > 0.3 && max < Math.PI / 2);
});

test("cualquier entrada lo detiene con suavidad", () => {
	const idle = createIdle();
	run(idle, IDLE_DELAY + 5);
	idle.poke();
	const first = idle.update(1 / 60);
	assert.ok(first.weight > 0.5); // no salta de golpe
	assert.equal(run(idle, 2).weight, 0);
});

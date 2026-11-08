import assert from "node:assert/strict";
import test from "node:test";
import { createLetters, letterLevel } from "../src/letters.js";

const frames = (letters, n, input) => {
	let level;
	for (let i = 0; i < n; i++) level = letters.update({ dt: 1 / 60, motion: true, ...input });
	return level;
};

test("las letras se encienden con la música y se apagan en los pasajes tranquilos", () => {
	assert.ok(letterLevel({ bass: 0, mid: 0, pulse: 0 }) < 1);
	assert.ok(letterLevel({ bass: 1, mid: 1, pulse: 1 }) > 1.5);
	const title = { emissive: {}, emissiveIntensity: 1 };
	const letters = createLetters();
	letters.add(title);
	frames(letters, 60, { playing: true, bass: 1, mid: 1, pulse: 1 });
	assert.ok(title.emissiveIntensity > 1.5);
	frames(letters, 180, { playing: true, bass: 0, mid: 0, pulse: 0 });
	assert.ok(title.emissiveIntensity < 0.6);
});

test("en pausa o con movimiento reducido vuelven al brillo de Blender", () => {
	const title = { emissive: {}, emissiveIntensity: 1 };
	const letters = createLetters();
	letters.add(title);
	frames(letters, 60, { playing: true, bass: 1, mid: 1, pulse: 1 });
	frames(letters, 300, { playing: false, bass: 0, mid: 0, pulse: 0 });
	assert.ok(Math.abs(title.emissiveIntensity - 1) < 1e-3);
	frames(letters, 300, { playing: true, bass: 1, mid: 1, pulse: 1, motion: false });
	assert.ok(Math.abs(title.emissiveIntensity - 1) < 1e-3);
});

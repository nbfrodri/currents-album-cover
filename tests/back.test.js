import assert from "node:assert/strict";
import test from "node:test";
import { backRowCenter, backTrackAt } from "../src/back.js";

// Filas como las exporta Blender: v = top - k * step, u en [-half, half] (visto desde detrás)
const rows = { top: 0.6, step: 0.075, half: 0.86, count: 13, cap: 0.03 };
// En el espacio del modelo (glTF): x = -u, z = -v
const at = (u, v) => ({ x: -u, z: -v });

test("un clic en la contraportada elige el tema de esa fila", () => {
	assert.equal(backTrackAt(at(0, 0.6), rows), 0);
	assert.equal(backTrackAt(at(-0.5, 0.6 - 6 * 0.075 + 0.02), rows), 6);
	assert.equal(backTrackAt(at(0.8, 0.6 - 12 * 0.075), rows), 12);
});

test("fuera de las filas no elige ninguno", () => {
	assert.equal(backTrackAt(at(0, 0.8), rows), -1); // título
	assert.equal(backTrackAt(at(0, -0.7), rows), -1); // banda de rayas
	assert.equal(backTrackAt(at(0.95, 0.6), rows), -1); // margen
	assert.equal(backTrackAt(at(0, 0.6), null), -1); // modelo sin datos de filas
});

test("la franja de una fila cubre el texto, que está por encima de su línea base", () => {
	const { z, height } = backRowCenter(2, rows);
	const baseline = 0.6 - 2 * 0.075;
	assert.ok(Math.abs(-z - (baseline + 0.015)) < 1e-9); // centrada en las mayúsculas
	assert.ok(height < rows.step * 0.8); // no invade la fila siguiente
	assert.ok(-z - height / 2 > baseline - 0.015); // apenas baja de la línea base
});

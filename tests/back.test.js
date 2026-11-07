import assert from "node:assert/strict";
import test from "node:test";
import { backRowCenter, backTrackAt } from "../src/back.js";

// Filas como las exporta Blender: v = top - k * step, u en [-half, half] (visto desde detrás)
const rows = { top: 0.6, step: 0.075, half: 0.86, count: 13 };
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

test("el centro de una fila vuelve al espacio del modelo", () => {
	assert.deepEqual(backRowCenter(2, rows), { x: 0, z: -(0.6 - 2 * 0.075) });
});

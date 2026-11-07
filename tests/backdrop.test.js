import assert from "node:assert/strict";
import test from "node:test";
import { createBackdrop } from "../src/backdrop.js";

test("el fondo va detrás de todo y reacciona a la música con suavidad", () => {
	const backdrop = createBackdrop();
	assert.equal(backdrop.mesh.renderOrder < 0, true);
	assert.equal(backdrop.mesh.frustumCulled, false);
	const u = backdrop.mesh.material.uniforms;
	backdrop.update({ dt: 1 / 60, bass: 1, mid: 1, pulse: 1, beatAge: 0, aspect: 2, motion: true });
	assert.ok(u.uBass.value > 0 && u.uBass.value < 1); // se suaviza, no salta
	assert.equal(u.uAspect.value, 2);
	for (let i = 0; i < 300; i++) backdrop.update({ dt: 1 / 60, bass: 0, mid: 0, pulse: 0, beatAge: 9, aspect: 2, motion: true });
	assert.ok(u.uBass.value < 0.01 && u.uGlow.value < 0.01); // sin música vuelve a la calma
});

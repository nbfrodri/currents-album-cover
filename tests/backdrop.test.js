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

test("el brillo fucsia de las rayas sube y baja con el tiempo, y queda fijo con movimiento reducido", async () => {
	const { breath, BREATH_PERIOD } = await import("../src/backdrop.js");
	assert.equal(breath(0), 0);
	assert.ok(Math.abs(breath(BREATH_PERIOD / 2) - 1) < 1e-9);
	const backdrop = createBackdrop();
	const u = backdrop.mesh.material.uniforms;
	const values = new Set();
	for (let i = 0; i < 60 * BREATH_PERIOD; i += 30) {
		for (let k = 0; k < 30; k++) backdrop.update({ dt: 1 / 60, bass: 0, mid: 0, pulse: 0, beatAge: 9, aspect: 1, motion: true });
		values.add(u.uBreath.value.toFixed(2));
	}
	assert.ok(values.size > 5);
	backdrop.update({ dt: 1, bass: 0, mid: 0, pulse: 0, beatAge: 9, aspect: 1, motion: false });
	assert.equal(u.uBreath.value, 0.5);
});

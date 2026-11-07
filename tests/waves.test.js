import assert from "node:assert/strict";
import test from "node:test";
import { TRAIL_POINTS, addTrailPoint, waveUniforms } from "../src/waves.js";

test("el rastro del puntero guarda puntos separados y recicla los más antiguos", () => {
	const trail = waveUniforms.uTrail.value;
	assert.equal(trail.length, TRAIL_POINTS);
	addTrailPoint({ x: 0, z: 0 }, 1);
	addTrailPoint({ x: 0.001, z: 0 }, 1.01); // demasiado cerca: no deja otra gota
	assert.equal(trail.filter((p) => p.w > 0).length, 1);
	for (let i = 1; i <= TRAIL_POINTS + 3; i++) addTrailPoint({ x: i * 0.1, z: 0 }, 1 + i * 0.05);
	assert.equal(trail.filter((p) => p.w > 0).length, TRAIL_POINTS);
	assert.ok(trail.some((p) => p.x === (TRAIL_POINTS + 3) * 0.1)); // el último sigue
	assert.ok(!trail.some((p) => p.x === 0 && p.w > 0)); // el primero ya se reutilizó
	const newest = trail.find((p) => p.x === (TRAIL_POINTS + 3) * 0.1);
	assert.equal(newest.z, 0); // posición z del modelo
	assert.equal(newest.y, 1 + (TRAIL_POINTS + 3) * 0.05); // momento en que nació
});


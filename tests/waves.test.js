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


test("las rayas y la estela no comparten programa: las rayas nunca se tiñen con el tema", async () => {
	const THREE = await import("three");
	const { addWaves, trailWaves } = await import("../src/waves.js");
	const stripes = new THREE.MeshStandardMaterial();
	const trail = new THREE.MeshStandardMaterial();
	addWaves(stripes);
	trailWaves(trail);
	assert.notEqual(stripes.customProgramCacheKey(), trail.customProgramCacheKey());
});

test("la línea del medio lleva un gradiente animado de principio a fin, sin tinte por tema", async () => {
	const THREE = await import("three");
	const { trailWaves, trailUniforms } = await import("../src/waves.js");
	const material = new THREE.MeshStandardMaterial();
	trailWaves(material);
	const shader = {
		uniforms: {},
		vertexShader: "#include <common>\n#include <begin_vertex>",
		fragmentShader: "#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>",
	};
	material.onBeforeCompile(shader);
	assert.match(shader.fragmentShader, /uTime/); // se mueve con el tiempo
	assert.match(shader.fragmentShader, /uRange/); // a lo largo de toda la línea
	assert.doesNotMatch(shader.fragmentShader, /uTint|uProgress/);
	assert.equal("uTint" in trailUniforms, false);
	assert.ok(shader.uniforms.uTime); // comparte el reloj de las ondas
});

test("de frente el latido se ve como luz: las rayas brillan con la onda y las crestas, la estela no", async () => {
	const THREE = await import("three");
	const { addWaves, trailWaves } = await import("../src/waves.js");
	const compile = (material) => {
		const shader = {
			uniforms: {},
			vertexShader: "#include <common>\n#include <begin_vertex>",
			fragmentShader: "#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>",
		};
		material.onBeforeCompile(shader);
		return shader;
	};
	const stripeMaterial = new THREE.MeshStandardMaterial();
	addWaves(stripeMaterial);
	const lit = compile(stripeMaterial);
	assert.match(lit.vertexShader, /vBeat = shock \* [\d.]+ \+ uPulse/);
	assert.match(lit.fragmentShader, /totalEmissiveRadiance \+= .*vBeat/);
	const trail = new THREE.MeshStandardMaterial();
	trailWaves(trail);
	assert.doesNotMatch(compile(trail).fragmentShader, /vBeat/);
});

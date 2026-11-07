import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createHalo } from "../src/halo.js";

test("el halo de la bola se enciende con el golpe, se recorta al marco y queda junto a la bola", () => {
	const planes = [new THREE.Plane()];
	const halo = createHalo(planes);
	assert.equal(halo.mesh.material.clipping, true);
	assert.equal(halo.mesh.material.clippingPlanes, planes);
	assert.equal(halo.mesh.visible, false); // sin bola no se ve
	halo.place(new THREE.Vector3(0.1, -0.2, 0.3), 0.2);
	assert.equal(halo.mesh.visible, true);
	assert.deepEqual([halo.mesh.position.x, halo.mesh.position.z], [0.1, 0.3]);
	assert.ok(halo.mesh.scale.x > 0.2 * 2); // más ancho que la bola
	halo.update(1, 0);
	assert.ok(halo.uniforms.uStrength.value > 0);
	halo.update(0, 99);
	assert.equal(halo.uniforms.uStrength.value, 0);
});

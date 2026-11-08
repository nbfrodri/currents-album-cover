import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLetters, letterLevel, letterScale } from "../src/letters.js";

const frames = (letters, n, input) => {
	let level;
	for (let i = 0; i < n; i++) level = letters.update({ dt: 1 / 60, motion: true, ...input });
	return level;
};

// texto de 2 x 0,2 cuyo origen está en su extremo izquierdo, como los de Blender
function word() {
	const geometry = new THREE.PlaneGeometry(2, 0.2).translate(1, 0, 0);
	const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ emissive: 0xff8800 }));
	mesh.position.set(-0.9, 0.8, 0);
	return mesh;
}

test("las letras se encienden con la música y se apagan en los pasajes tranquilos", () => {
	assert.ok(letterLevel({ bass: 0, mid: 0, pulse: 0 }) < 0.5);
	assert.ok(letterLevel({ bass: 1, mid: 1, pulse: 1 }) > 2);
	const title = word();
	const letters = createLetters();
	letters.add(title);
	frames(letters, 60, { playing: true, bass: 1, mid: 1, pulse: 1 });
	assert.ok(title.material.emissiveIntensity > 2);
	frames(letters, 180, { playing: true, bass: 0, mid: 0, pulse: 0 });
	assert.ok(title.material.emissiveIntensity < 0.5);
});

test("con cada golpe laten desde su centro y vuelven a su tamaño", () => {
	const title = word();
	const before = new THREE.Box3().setFromObject(title).getCenter(new THREE.Vector3());
	const letters = createLetters();
	letters.add(title);
	const after = new THREE.Box3().setFromObject(title).getCenter(new THREE.Vector3());
	assert.ok(before.distanceTo(after) < 1e-9); // recentrar no la mueve
	letters.update({ dt: 1 / 60, motion: true, playing: true, bass: 0, mid: 0, pulse: 1 });
	assert.equal(title.scale.x, letterScale(1));
	const grown = new THREE.Box3().setFromObject(title).getCenter(new THREE.Vector3());
	assert.ok(before.distanceTo(grown) < 1e-9); // crece sin desplazarse
	letters.update({ dt: 1 / 60, motion: true, playing: true, bass: 0, mid: 0, pulse: 0 });
	assert.equal(title.scale.x, 1);
});

test("en pausa o con movimiento reducido vuelven al brillo y tamaño de Blender", () => {
	const title = word();
	const letters = createLetters();
	letters.add(title);
	frames(letters, 60, { playing: true, bass: 1, mid: 1, pulse: 1 });
	frames(letters, 300, { playing: false, bass: 0, mid: 0, pulse: 1 });
	assert.ok(Math.abs(title.material.emissiveIntensity - 1) < 1e-3);
	assert.equal(title.scale.x, 1);
	frames(letters, 300, { playing: true, bass: 1, mid: 1, pulse: 1, motion: false });
	assert.ok(Math.abs(title.material.emissiveIntensity - 1) < 1e-3);
	assert.equal(title.scale.x, 1);
});

test("los temas del tracklist brillan con la música pero no laten", () => {
	const song = word();
	const letters = createLetters();
	letters.add(song, { bump: false });
	frames(letters, 30, { playing: true, bass: 1, mid: 1, pulse: 1 });
	assert.equal(song.scale.x, 1);
	assert.ok(song.material.emissiveIntensity > 1.5);
});

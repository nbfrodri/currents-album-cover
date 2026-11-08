import { Vector3 } from "three";

// Letras que siguen a la música: los títulos de la portada y los textos naranjas de la contraportada
// (materiales emisivos de Blender) se encienden con la energía del tema, se apagan en los pasajes
// tranquilos y, salvo los temas del tracklist, laten (crecen un poco y vuelven) con cada golpe, como
// la bola. En pausa, o con movimiento reducido, vuelven a su brillo y tamaño de Blender.
const DIM = 0.3; // brillo con música muy tranquila (1 = el de Blender)
const BRIGHT = 2.8; // brillo con mucha energía
const BUMP = 0.12; // cuánto crecen en un golpe pleno

const follow = (value, target, time, dt) => value + (target - value) * Math.min(1, dt / time);

export function letterLevel({ bass, mid, pulse }) {
	const energy = Math.min(1, 0.35 * mid + 0.25 * bass + 0.7 * pulse);
	return DIM + (BRIGHT - DIM) * energy;
}

export const letterScale = (pulse) => 1 + BUMP * pulse;

// Lleva el origen de la pieza al centro de su texto, para que crezca desde ahí y no desde un extremo
function centerOrigin(mesh) {
	const geometry = mesh.geometry;
	geometry.computeBoundingBox();
	const center = geometry.boundingBox.getCenter(new Vector3());
	geometry.translate(-center.x, -center.y, -center.z);
	mesh.position.add(center.multiply(mesh.scale).applyQuaternion(mesh.quaternion));
}

export function createLetters() {
	const materials = new Map(); // material → brillo emisivo de Blender
	const meshes = new Map(); // pieza → escala de Blender
	let level = 1;

	return {
		// bump: false → solo brilla, sin latir (los temas del tracklist)
		add(mesh, { bump = true } = {}) {
			const material = mesh.material;
			if (!material?.emissive || meshes.has(mesh)) return;
			if (!materials.has(material)) materials.set(material, material.emissiveIntensity);
			if (!bump) return;
			centerOrigin(mesh);
			meshes.set(mesh, mesh.scale.x);
		},
		update({ dt, playing, bass, mid, pulse, motion }) {
			const live = playing && motion;
			const target = live ? letterLevel({ bass, mid, pulse }) : 1;
			level = follow(level, target, target > level ? 0.05 : 0.3, dt); // sube rápido, cae despacio
			for (const [material, base] of materials) material.emissiveIntensity = base * level;
			const scale = letterScale(live ? pulse : 0);
			for (const [mesh, base] of meshes) mesh.scale.setScalar(base * scale);
			return level;
		},
	};
}

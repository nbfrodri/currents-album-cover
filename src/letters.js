// Letras que siguen a la música: los títulos de la portada y de la contraportada (materiales
// emisivos de Blender) se encienden con la energía del tema y se apagan en los pasajes tranquilos.
// En pausa, o con movimiento reducido, vuelven a su brillo de Blender.
const DIM = 0.45; // brillo con música muy tranquila (1 = el de Blender)
const BRIGHT = 1.9; // brillo con mucha energía

const follow = (value, target, time, dt) => value + (target - value) * Math.min(1, dt / time);

export function letterLevel({ bass, mid, pulse }) {
	const energy = Math.min(1, 0.5 * mid + 0.3 * bass + 0.4 * pulse);
	return DIM + (BRIGHT - DIM) * energy;
}

export function createLetters() {
	const materials = new Map(); // material → brillo emisivo de Blender
	let level = 1;

	return {
		add(material) {
			if (!material?.emissive || materials.has(material)) return;
			materials.set(material, material.emissiveIntensity);
		},
		update({ dt, playing, bass, mid, pulse, motion }) {
			const target = playing && motion ? letterLevel({ bass, mid, pulse }) : 1;
			level = follow(level, target, target > level ? 0.06 : 0.35, dt); // sube rápido, cae despacio
			for (const [material, base] of materials) material.emissiveIntensity = base * level;
			return level;
		},
	};
}

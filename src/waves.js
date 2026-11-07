import * as THREE from "three";
import { TRACKS } from "./tracks.js";

// Uniformes compartidos por los shaders inyectados: ondas al pasar el ratón, pulso con los graves
// y la estela que se tiñe con el tema y avanza con su progreso
// Agua: al mover el ratón por la portada caen "gotas" (x, nacimiento, z, fuerza en el espacio del
// modelo); cada una abre ondas concéntricas suaves que se propagan despacio y se amortiguan
export const TRAIL_POINTS = 12;
const TRAIL_SPACING = 0.06; // distancia mínima entre gotas (modelo)
export const TRAIL_LIFE = 2.5; // segundos que duran las ondas de una gota
export const waveUniforms = {
	uTime: { value: 0 },
	uTrail: { value: Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector4(0, -99, 0, 0)) },
	uBass: { value: 0 },
	uPulse: { value: 0 }, // latido (0..1)
	uBeatAge: { value: 99 }, // segundos desde el último golpe
	uBall: { value: new THREE.Vector2() }, // centro de la bola en el plano del modelo (xz)
};

let nextTrail = 0;
let lastTrail = null;
export function addTrailPoint(point, time) {
	if (lastTrail && Math.hypot(point.x - lastTrail.x, point.z - lastTrail.z) < TRAIL_SPACING) return;
	waveUniforms.uTrail.value[nextTrail].set(point.x, time, point.z, 1);
	nextTrail = (nextTrail + 1) % TRAIL_POINTS;
	lastTrail = { x: point.x, z: point.z };
}
export const trailUniforms = {
	uTint: { value: new THREE.Color(TRACKS[0].tint) },
	uProgress: { value: 0 },
	uActive: { value: 0 },
	uRange: { value: new THREE.Vector2(0, 1) },
};

// Las crestas suben con los graves. Cada gota del ratón: ondas de agua (varias crestas, onda
// larga) que solo existen donde ya ha llegado el frente, se amortiguan con la distancia y se
// apagan con la edad; ondulan la superficie y mecen un poco las rayas hacia los lados
const WAVE_VERTEX = `
	float lifted = max(transformed.y, 0.0);
	transformed.y += lifted * (uBass * 1.4 + uPulse * 2.5); // las crestas saltan con cada golpe
	// onda expansiva del latido: sale de la bola y recorre las ondas, levantándolas y empujándolas
	vec2 fromBall = transformed.xz - uBall;
	float db = length(fromBall);
	float shock = exp(-pow((db - uBeatAge * 1.4) * 9.0, 2.0)) * exp(-uBeatAge * 2.2);
	transformed.y += shock * 0.035;
	transformed.xz += fromBall / max(db, 1e-4) * shock * 0.014;
	float water = 0.0;
	vec2 sway = vec2(0.0);
	for (int i = 0; i < ${TRAIL_POINTS}; i++) {
		vec4 p = uTrail[i];
		float age = uTime - p.y;
		if (p.w <= 0.0 || age < 0.0 || age > ${TRAIL_LIFE.toFixed(1)}) continue;
		vec2 delta = transformed.xz - p.xz;
		float d = length(delta);
		float reached = 1.0 - smoothstep(age * 0.35 - 0.05, age * 0.35, d); // frente a 0.35 u/s
		float life = 1.0 - age / ${TRAIL_LIFE.toFixed(1)};
		float wave = sin(d * 38.0 - age * 9.0) * exp(-d * 4.0) * reached * life * life * p.w;
		water += wave;
		sway += delta / max(d, 1e-4) * wave;
	}
	transformed.y += water * 0.012;
	transformed.xz += sway * 0.006;
`;

export function addWaves(material, extra = {}) {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, waveUniforms, extra.uniforms);
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", `#include <common>\nuniform float uTime, uBass, uPulse, uBeatAge;\nuniform vec2 uBall;\nuniform vec4 uTrail[${TRAIL_POINTS}];\n${extra.vertexHead ?? ""}`)
			.replace("#include <begin_vertex>", `#include <begin_vertex>\n${WAVE_VERTEX}\n${extra.vertexBody ?? ""}`);
		if (extra.fragment) extra.fragment(shader);
	};
}

// La estela: el tema que suena la tiñe, y una cabeza brillante la recorre según el progreso
export function trailWaves(material) {
	addWaves(material, {
		uniforms: trailUniforms,
		vertexHead: "varying float vAlong;",
		vertexBody: "vAlong = uv.x;",
		fragment(shader) {
			shader.fragmentShader = shader.fragmentShader
				.replace("#include <common>", "#include <common>\nuniform vec3 uTint;\nuniform float uProgress, uActive;\nuniform vec2 uRange;\nvarying float vAlong;")
				.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint, 0.2 * uActive);")
				.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
	float head = mix(uRange.x, uRange.y, uProgress);
	float glow = exp(-pow((vAlong - head) * 10.0, 2.0));
	totalEmissiveRadiance += uActive * uTint * glow * 1.2; // solo una luz suave que recorre la estela`);
		},
	});
}

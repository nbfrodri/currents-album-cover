import * as THREE from "three";
import { TRACKS } from "./tracks.js";

// Uniformes compartidos por los shaders inyectados: ondas al pasar el ratón, pulso con los graves
// y la estela que se tiñe con el tema y avanza con su progreso
export const waveUniforms = {
	uTime: { value: 0 },
	uPointer: { value: new THREE.Vector3(9, 0, 9) }, // en el espacio del modelo
	uHover: { value: 0 },
	uBass: { value: 0 },
};
export const trailUniforms = {
	uTint: { value: new THREE.Color(TRACKS[0].tint) },
	uProgress: { value: 0 },
	uActive: { value: 0 },
	uRange: { value: new THREE.Vector2(0, 1) },
};

// Desplazamiento en altura (y del modelo): onda alrededor del puntero y las crestas suben con los graves
const WAVE_VERTEX = `
	float lifted = max(transformed.y, 0.0);
	transformed.y += lifted * uBass * 1.4;
	float d = distance(transformed.xz, uPointer.xz);
	transformed.y += uHover * 0.022 * sin(d * 55.0 - uTime * 7.0) * exp(-d * d * 28.0);
`;

export function addWaves(material, extra = {}) {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, waveUniforms, extra.uniforms);
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", `#include <common>\nuniform float uTime, uHover, uBass;\nuniform vec3 uPointer;\n${extra.vertexHead ?? ""}`)
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
				.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint, 0.45 * uActive);")
				.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
	float head = mix(uRange.x, uRange.y, uProgress);
	float glow = exp(-pow((vAlong - head) * 16.0, 2.0));
	totalEmissiveRadiance += uActive * (uTint * glow * 2.5 + diffuseColor.rgb * step(vAlong, head) * 0.3);`);
		},
	});
}

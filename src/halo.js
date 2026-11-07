import * as THREE from "three";

// Halo del latido alrededor de la bola, en el plano de la portada: un resplandor lila que se
// enciende con cada golpe y un anillo que se abre y se apaga. Es luz, no movimiento: se ve de
// frente y desde lejos sin marear. Recortado al marco como el resto de la escena.
const VERTEX = `
	#include <clipping_planes_pars_vertex>
	varying vec2 vUv;
	void main() {
		vUv = uv;
		#include <begin_vertex>
		#include <project_vertex>
		#include <clipping_planes_vertex>
	}
`;

const FRAGMENT = `
	#include <clipping_planes_pars_fragment>
	uniform float uStrength, uAge;
	varying vec2 vUv;
	void main() {
		#include <clipping_planes_fragment>
		float r = length(vUv - 0.5) * 2.0; // 0 en el centro, 1 en el borde
		float glow = exp(-r * r * 9.0);
		float ring = exp(-pow((r - 0.3 - uAge * 0.8) * 7.0, 2.0)) * exp(-uAge * 2.5);
		float alpha = (glow * uStrength + ring * 0.35) * smoothstep(1.0, 0.75, r);
		gl_FragColor = vec4(vec3(0.79, 0.68, 0.95) * alpha, 1.0);
	}
`;

export function createHalo(clippingPlanes) {
	const uniforms = { uStrength: { value: 0 }, uAge: { value: 99 } };
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		new THREE.ShaderMaterial({
			uniforms,
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			clipping: true,
			clippingPlanes,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	mesh.rotation.x = -Math.PI / 2; // en el plano xz del modelo (y es la altura)
	mesh.visible = false;

	// Junto a la bola: centrado en ella, por encima del relieve de las rayas
	function place(ball, radius) {
		mesh.position.set(ball.x, 0.04, ball.z);
		mesh.scale.setScalar(radius * 7);
		mesh.visible = true;
	}

	// pulse 0..1 del latido; age = segundos desde el último golpe
	function update(pulse, age) {
		uniforms.uStrength.value = pulse * 0.5;
		uniforms.uAge.value = age;
	}

	return { mesh, place, update, uniforms };
}

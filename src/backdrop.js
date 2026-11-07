import * as THREE from "three";

// Fondo de la página: rayas lila diagonales como las de la portada, con luz de cresta, que ondulan
// con ondas largas y lentas. La música las mueve con suavidad: los graves amplían las ondas, los
// medios iluminan y cada golpe deja una onda suave desde el centro. Tenue: la portada manda.
const VERTEX = `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.9999, 1.0); // pantalla completa, al fondo del todo
	}
`;

const FRAGMENT = `
	uniform float uTime, uBass, uMid, uGlow, uAspect, uBeatAge;
	varying vec2 vUv;
	void main() {
		vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
		// ejes de la portada: a lo largo de la corriente y a lo ancho de las rayas
		vec2 along = normalize(vec2(0.67, -0.74));
		vec2 across = vec2(-along.y, along.x);
		float a = dot(p, along);
		float c = dot(p, across);
		float t = uTime;
		// ondas largas y lentas que desplazan las rayas de lado; los graves las hacen más amplias
		float amp = 0.05 + uBass * 0.05;
		float shift = amp * (0.6 * sin(a * 2.6 + c * 1.2 + t * 0.35) + 0.4 * sin(a * 4.3 - c * 2.0 - t * 0.27));
		shift += 0.012 * sin(c * 4.0 + t * 0.2); // respiración lenta a lo ancho
		// onda suave del último golpe, que sale del centro
		float ring = exp(-pow((length(p) - uBeatAge * 0.6) * 6.0, 2.0)) * exp(-uBeatAge * 1.8);
		shift += ring * 0.012;
		// rayas finas con volumen: luz en la cresta, lados más oscuros y huecos negros
		float profile = 0.5 + 0.5 * sin((c + shift) * 170.0 + t * 0.4);
		float body = smoothstep(0.45, 0.8, profile);
		float crest = pow(profile, 10.0);
		// como en el original: más claro abajo a la izquierda, casi negro arriba a la derecha
		float shade = 1.0 - smoothstep(-0.6, 0.7, p.x * 0.8 + p.y * 0.9);
		float vignette = smoothstep(1.1, 0.25, length(p * vec2(0.9, 1.2)));
		float light = (0.08 + 0.12 * uMid + 0.08 * uGlow + 0.15 * ring) * (0.35 + 0.65 * shade) * vignette;
		vec3 ink = vec3(0.027, 0.012, 0.043);
		vec3 violet = vec3(0.36, 0.22, 0.55);
		vec3 lilac = vec3(0.86, 0.76, 0.98);
		gl_FragColor = vec4(mix(ink, mix(violet, lilac, crest), body * light * 1.8), 1.0);
		#include <colorspace_fragment>
	}
`;

const follow = (value, target, time, dt) => value + (target - value) * Math.min(1, dt / time);

export function createBackdrop() {
	const uniforms = {
		uTime: { value: 0 },
		uBass: { value: 0 },
		uMid: { value: 0 },
		uGlow: { value: 0 },
		uAspect: { value: 1 },
		uBeatAge: { value: 99 }, // segundos desde el último latido
	};
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(2, 2),
		new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false }),
	);
	mesh.frustumCulled = false;
	mesh.renderOrder = -1;

	function update({ dt, bass, mid, pulse, beatAge, aspect, motion }) {
		uniforms.uAspect.value = aspect;
		if (!motion) {
			// movimiento reducido: rayas quietas, sin reaccionar a la música
			uniforms.uBass.value = uniforms.uMid.value = uniforms.uGlow.value = 0;
			return;
		}
		uniforms.uTime.value += dt * (1 + bass * 0.6); // algo más de prisa con energía, sin agitarse
		uniforms.uBass.value = follow(uniforms.uBass.value, bass, 0.3, dt);
		uniforms.uMid.value = follow(uniforms.uMid.value, mid, 0.3, dt);
		uniforms.uGlow.value = follow(uniforms.uGlow.value, pulse, 0.08, dt);
		uniforms.uBeatAge.value = beatAge;
	}

	return { mesh, update };
}

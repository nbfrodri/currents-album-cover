import * as THREE from "three";

// Fondo de la página: azul grisáceo, con rayas diagonales en relieve
// que ondulan con ondas largas y lentas; una franja de meandros redondos deriva despacio y hay
// un halo detrás de la portada. La música lo mueve con
// suavidad: graves que amplían las ondas, medios que iluminan y una onda suave en cada golpe.
// Todo va despacio y con poco contraste para que no maree.
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
		float t = uTime * 0.5; // lento: un fondo que se mueve deprisa marea
		// ondas largas y lentas en todo el fondo; los graves las amplían
		float amp = 0.04 + uBass * 0.05;
		float shift = amp * (0.6 * sin(a * 2.6 + c * 1.2 + t * 0.35) + 0.4 * sin(a * 4.3 - c * 2.0 - t * 0.27));
		// una franja de rayas derretidas en meandros redondos (como la estela bajo la bola) que
		// deriva despacio por la pantalla
		float band = smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(c * 2.2 - a * 0.6 + t * 0.06));
		shift += band * (0.03 + uBass * 0.02) * sin(a * 14.0 + 3.0 * sin(c * 3.0 + t * 0.2) + t * 0.5);
		// onda suave del último golpe, que sale del centro
		float ring = exp(-pow((length(p) - uBeatAge * 0.6) * 6.0, 2.0)) * exp(-uBeatAge * 1.8);
		shift += ring * 0.012;
		// rayas con volumen sobre azul grisáceo: surcos más oscuros, cresta clara.
		// No se deslizan (solo ondulan) y no son demasiado finas: así no parpadean en muaré
		float profile = 0.5 + 0.5 * sin((c + shift) * 120.0);
		float body = smoothstep(0.45, 0.8, profile);
		float crest = pow(profile, 10.0);
		// luz como en el original (más clara abajo a la izquierda), viñeta suave y halo detrás de la
		// portada que late con la música
		vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
		float shade = 1.0 - smoothstep(-0.6, 0.7, q.x * 0.8 + q.y * 0.9);
		float vignette = smoothstep(1.1, 0.25, length(q * vec2(0.9, 1.2)));
		float halo = exp(-dot(q, q) * 5.0);
		// colores en lineal: #4a5868 (azul grisáceo), su versión en sombra y #7d8ea2 en la cresta
		vec3 slate = vec3(0.068, 0.0975, 0.139);
		vec3 shadow = slate * 0.55;
		vec3 light = vec3(0.205, 0.27, 0.361);
		float groove = (1.0 - body) * (0.22 + 0.06 * band) * (0.7 + 0.3 * (1.0 - shade));
		vec3 color = mix(slate, shadow, groove * 1.6);
		color = mix(color, light, crest * (0.12 + 0.2 * uMid + 0.15 * uGlow + 0.3 * ring) * (0.5 + 0.5 * shade));
		color *= mix(0.82, 1.0, vignette) * (1.0 + 0.06 * halo * uGlow);
		gl_FragColor = vec4(color, 1.0);
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
		uniforms.uTime.value += dt * (1 + bass * 0.3); // apenas más deprisa con energía
		uniforms.uBass.value = follow(uniforms.uBass.value, bass, 0.3, dt);
		uniforms.uMid.value = follow(uniforms.uMid.value, mid, 0.3, dt);
		uniforms.uGlow.value = follow(uniforms.uGlow.value, pulse, 0.08, dt);
		uniforms.uBeatAge.value = beatAge;
	}

	return { mesh, update };
}

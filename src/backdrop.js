import * as THREE from "three";

// Fondo de la página: morado oscuro, con rayas diagonales de un morado claro y apagado
// con un brillo fucsia en su interior que sube y baja despacio. Las rayas
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
	uniform float uTime, uBass, uMid, uGlow, uAspect, uBeatAge, uBreath;
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
		float amp = 0.04 + uBass * 0.07;
		float shift = amp * (0.6 * sin(a * 2.6 + c * 1.2 + t * 0.35) + 0.4 * sin(a * 4.3 - c * 2.0 - t * 0.27));
		// una franja de rayas derretidas en meandros redondos (como la estela bajo la bola) que
		// deriva despacio por la pantalla
		float band = smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(c * 2.2 - a * 0.6 + t * 0.06));
		shift += band * (0.03 + uBass * 0.028) * sin(a * 14.0 + 3.0 * sin(c * 3.0 + t * 0.2) + t * 0.5);
		// onda suave del último golpe, que sale del centro
		float ring = exp(-pow((length(p) - uBeatAge * 0.6) * 6.0, 2.0)) * exp(-uBeatAge * 1.8);
		shift += ring * 0.016;
		// rayas morado claro sobre morado oscuro, con el núcleo encendido en fucsia.
		// No se deslizan (solo ondulan) y no son demasiado finas: así no parpadean en muaré
		float profile = 0.5 + 0.5 * sin((c + shift) * 120.0);
		float body = smoothstep(0.45, 0.8, profile);
		// luz como en el original (más clara abajo a la izquierda), viñeta suave y halo detrás de la
		// portada que late con la música
		vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
		float shade = 1.0 - smoothstep(-0.6, 0.7, q.x * 0.8 + q.y * 0.9);
		float vignette = smoothstep(1.1, 0.25, length(q * vec2(0.9, 1.2)));
		float halo = exp(-dot(q, q) * 5.0);
		// colores en lineal: fondo #241433 (morado oscuro), raya #8a7a9e (morado claro apagado) y
		// brillo #ff2fb4 (fucsia) en el centro de cada raya
		vec3 night = vec3(0.0176, 0.007, 0.0331);
		vec3 lilac = vec3(0.254, 0.195, 0.342);
		vec3 fuchsia = vec3(1.0, 0.028, 0.456);
		float lit = (0.55 + 0.45 * shade) * (0.85 + 0.15 * band);
		vec3 color = mix(night, lilac, body * 0.32 * lit);
		// brillo interior: respira con el tiempo (uBreath) y se aviva con los medios y los golpes
		float core = pow(profile, 6.0);
		float glow = 0.05 + 0.3 * uBreath + 0.18 * uMid + 0.15 * uGlow + 0.3 * ring;
		color += fuchsia * core * glow * lit;
		color *= mix(0.78, 1.0, vignette) * (1.0 + 0.09 * halo * uGlow);
		gl_FragColor = vec4(color, 1.0);
		#include <colorspace_fragment>
	}
`;

// Respiración del brillo: un ciclo lento de ~7 s, entre apagado (0) y pleno (1)
export const BREATH_PERIOD = 7;
export const breath = (seconds) => 0.5 - 0.5 * Math.cos((seconds / BREATH_PERIOD) * Math.PI * 2);

const follow = (value, target, time, dt) => value + (target - value) * Math.min(1, dt / time);

export function createBackdrop() {
	const uniforms = {
		uTime: { value: 0 },
		uBass: { value: 0 },
		uMid: { value: 0 },
		uGlow: { value: 0 },
		uAspect: { value: 1 },
		uBeatAge: { value: 99 }, // segundos desde el último latido
		uBreath: { value: 0.5 }, // 0..1: intensidad del brillo fucsia, que sube y baja con el tiempo
	};
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(2, 2),
		new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false }),
	);
	mesh.frustumCulled = false;
	mesh.renderOrder = -1;

	let clock = 0;
	function update({ dt, bass, mid, pulse, beatAge, aspect, motion }) {
		uniforms.uAspect.value = aspect;
		clock += dt;
		if (!motion) {
			// movimiento reducido: rayas quietas, sin reaccionar a la música
			uniforms.uBass.value = uniforms.uMid.value = uniforms.uGlow.value = 0;
			uniforms.uBreath.value = 0.5; // brillo fijo
			return;
		}
		uniforms.uBreath.value = breath(clock);
		uniforms.uTime.value += dt * (1 + bass * 0.3); // apenas más deprisa con energía
		uniforms.uBass.value = follow(uniforms.uBass.value, bass, 0.3, dt);
		uniforms.uMid.value = follow(uniforms.uMid.value, mid, 0.3, dt);
		uniforms.uGlow.value = follow(uniforms.uGlow.value, pulse, 0.08, dt);
		uniforms.uBeatAge.value = beatAge;
	}

	return { mesh, update };
}

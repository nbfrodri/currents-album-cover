// Arcoíris holográfico (estilo Inigo Quilez) para la lámina de fondo.
const palette = /* glsl */ `
	vec3 palette(float t) {
		return vec3(0.6, 0.38, 0.5) + vec3(0.4, 0.35, 0.4) * cos(6.28318 * (t + vec3(0.0, 0.15, 0.3)));
	}
`;

// Rampa cíclica cálida de Currents para las líneas: naranja → rojo → magenta → naranja.
const warm = /* glsl */ `
	vec3 warm(float t) {
		t = fract(t) * 3.0;
		vec3 orange = vec3(1.0, 0.52, 0.12);
		vec3 red = vec3(0.95, 0.16, 0.18);
		vec3 magenta = vec3(0.85, 0.22, 0.65);
		if (t < 1.0) return mix(orange, red, t);
		if (t < 2.0) return mix(red, magenta, t - 1.0);
		return mix(magenta, orange, t - 2.0);
	}
`;

// Líneas de corriente: iridiscencia según el ángulo de visión + pulso que recorre cada línea.
export const linesShader = {
	vertexShader: /* glsl */ `
		varying vec3 vNormal;
		varying vec3 vView;
		varying vec2 vUv;
		void main() {
			vUv = uv;
			vec4 mv = modelViewMatrix * vec4(position, 1.0);
			vView = normalize(-mv.xyz);
			vNormal = normalize(normalMatrix * normal);
			gl_Position = projectionMatrix * mv;
		}
	`,
	fragmentShader: /* glsl */ `
		uniform float uTime;
		uniform vec2 uTilt;
		uniform float uPulse;
		varying vec3 vNormal;
		varying vec3 vView;
		varying vec2 vUv;
		${warm}
		void main() {
			vec3 n = normalize(vNormal);
			float facing = max(dot(n, normalize(vView)), 0.0);
			float fresnel = pow(1.0 - facing, 2.0);
			float hue = vUv.y * 0.6 + vUv.x * 0.15 + dot(uTilt, vec2(0.9, 0.7)) + fresnel * 0.35;
			vec3 color = warm(hue);
			float light = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.3, 0.5, 1.0))), 0.0);
			float wave = sin((vUv.x * 5.0 - uTime * 0.35 + vUv.y * 11.0) * 6.28318) * 0.5 + 0.5;
			float pulse = smoothstep(0.93, 1.0, wave) * uPulse;
			gl_FragColor = vec4(color * light + fresnel * 0.35 + pulse * 0.5, 1.0);
		}
	`,
};

// Fondo de la portada: degradado + lámina holográfica (bandas arcoíris y destellos) que reacciona a la inclinación.
export const foilShader = {
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: /* glsl */ `
		uniform float uTime;
		uniform vec2 uTilt;
		varying vec2 vUv;
		${palette}
		float hash(vec2 p) {
			return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
		}
		void main() {
			vec3 base = mix(vec3(0.07, 0.01, 0.13), vec3(0.3, 0.05, 0.32), smoothstep(-0.1, 1.3, vUv.x * 0.6 + vUv.y * 0.8));
			float tilt = clamp(length(uTilt) * 2.5, 0.0, 1.0);
			float bands = sin((vUv.x + vUv.y) * 16.0 + (uTilt.x - uTilt.y) * 14.0) * 0.5 + 0.5;
			vec3 rainbow = palette(vUv.x * 0.7 + vUv.y * 0.3 + uTilt.x * 0.9 + uTilt.y * 0.6);
			vec3 color = base + rainbow * bands * (0.06 + 0.22 * tilt);

			vec2 cell = floor(vUv * 140.0);
			float spark = step(0.985, hash(cell));
			float twinkle = sin(hash(cell + 7.0) * 40.0 + (uTilt.x + uTilt.y) * 30.0 + uTime) * 0.5 + 0.5;
			color += spark * twinkle * tilt * 0.6;

			float vignette = smoothstep(1.0, 0.35, length(vUv - 0.5) * 1.3);
			gl_FragColor = vec4(color * (0.55 + 0.45 * vignette), 1.0);
		}
	`,
};

// Brillo especular que sigue al puntero, como el reflejo sobre una carta plastificada.
export const glareShader = {
	vertexShader: foilShader.vertexShader,
	fragmentShader: /* glsl */ `
		uniform vec2 uPointer;
		uniform float uStrength;
		varying vec2 vUv;
		void main() {
			float d = distance(vUv, uPointer);
			float glare = pow(max(1.0 - d * 1.4, 0.0), 3.0) * uStrength;
			gl_FragColor = vec4(vec3(1.0, 0.92, 0.98) * glare, glare);
		}
	`,
};

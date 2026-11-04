// Coordenadas "de imagen": (0,0) arriba a la izquierda, (1,1) abajo a la derecha, como la portada original.
const common = /* glsl */ `
	const vec2 BALL = vec2(0.53, 0.62);
	const float BALL_R = 0.105;

	float hash(vec2 p) {
		return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
	}

	float noise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
	}

	vec3 rainbow(float t) {
		return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
	}
`;

const planeVertex = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

// Superficie de rayas: rectas hasta la bola, onduladas detrás de ella, y un canal entre rayas
// por donde pasa la bola (rojo antes de llegar, rosa → amarillo después).
export const surfaceShader = {
	vertexShader: planeVertex,
	fragmentShader: /* glsl */ `
		uniform float uTime;
		uniform float uMotion;
		uniform vec2 uTilt;
		varying vec2 vUv;
		${common}

		// Trayectoria: de la esquina superior izquierda (0,0) al centro de la bola
		const vec2 DIR = vec2(0.6498, 0.7601);
		const vec2 PERP = vec2(-0.7601, 0.6498);

		// Cuánto se ondula cada punto: nada antes de la bola, un abanico que se abre detrás
		float wake(vec2 p) {
			vec2 rel = p - BALL;
			float along = dot(rel, DIR);
			float across = dot(rel, PERP);
			float spread = 0.06 + 1.1 * max(along, 0.0);
			float fan = exp(-pow(across / spread, 2.0));
			return smoothstep(-0.06, 0.12, along) * fan;
		}

		void main() {
			vec2 p = vec2(vUv.x, 1.0 - vUv.y);
			float t = uTime * uMotion;
			float w = wake(p);
			float along0 = dot(p - BALL, DIR);

			// Ondas que viajan aguas abajo + irregularidad de ruido, solo en la estela
			float n = noise(p * 5.0 + vec2(0.0, t * 0.05));
			vec2 q = p + PERP * w * 0.032 * sin(along0 * 34.0 - t * 0.8 + n * 6.0);
			q += w * 0.03 * (vec2(noise(q * 13.0 - t * 0.04), noise(q * 13.0 + 5.7 + t * 0.04)) - 0.5) * 2.0;

			// Función de corriente: rayas paralelas a la trayectoria que rodean la bola
			vec2 rel = q - BALL;
			float along = dot(rel, DIR);
			float r2 = max(dot(rel, rel), 1e-4);
			float psi = dot(rel, PERP) * (1.0 - BALL_R * BALL_R / r2);

			// Canal: las rayas se apartan dejando un hueco que se ensancha cerca de la bola
			float gap = along < 0.0
				? mix(0.004, 0.011, smoothstep(-0.8, -0.05, along))
				: mix(0.009, 0.006, smoothstep(0.0, 0.4, along));
			float aa = fwidth(psi) * 1.2;
			// psi = 0 también en el contorno de la bola: el canal se limita al eje de la trayectoria
			float onAxis = 1.0 - smoothstep(0.025, 0.045, abs(dot(rel, PERP)));
			float channel = (1.0 - smoothstep(gap - aa, gap + aa, abs(psi))) * onAxis;

			float f = sign(psi) * max(abs(psi) - gap, 0.0) * 70.0;
			float tri = abs(fract(f) - 0.5) * 2.0;
			float faa = fwidth(f) * 1.5;
			float stripe = smoothstep(0.5 - faa, 0.5 + faa, tri); // 1 = raya lila, 0 = raya negra

			// Lila que se oscurece hacia arriba a la derecha (la superficie se aleja)
			float far = smoothstep(0.35, 1.15, p.x * 0.75 + (1.0 - p.y) * 0.7);
			vec3 lilac = mix(vec3(0.8, 0.68, 0.95), vec3(0.2, 0.09, 0.3), far);
			vec3 ink = vec3(0.035, 0.015, 0.05);

			// Efecto holo de carta: arcoíris sutil sobre las rayas claras al inclinar
			float tilt = clamp(length(uTilt) * 2.5, 0.0, 1.0);
			vec3 holo = rainbow(p.x * 0.8 + p.y * 0.5 + uTilt.x * 1.2 - uTilt.y * 0.8);
			lilac += holo * tilt * 0.14 * (1.0 - far);
			vec3 color = mix(ink, lilac, stripe);

			// Color del canal: rojo hasta la bola, luego rosa → naranja → amarillo
			vec3 red = vec3(0.92, 0.08, 0.18);
			vec3 pink = vec3(1.0, 0.3, 0.55);
			vec3 orange = vec3(1.0, 0.55, 0.1);
			vec3 yellow = vec3(1.0, 0.82, 0.25);
			vec3 trail = along < 0.0
				? mix(red, pink, smoothstep(-0.2, 0.0, along))
				: mix(mix(pink, orange, smoothstep(0.0, 0.18, along)), yellow, smoothstep(0.18, 0.45, along));
			color = mix(color, trail, channel);

			// Sombra de contacto de la bola (luz desde arriba a la izquierda)
			float shadow = 1.0 - smoothstep(BALL_R * 0.5, BALL_R * 1.5, length((p - BALL - vec2(0.025, 0.035)) * vec2(1.0, 1.3)));
			color *= 1.0 - shadow * 0.7;

			// Banda oscura superior, donde va el texto
			color *= mix(0.12, 1.0, smoothstep(0.0, 0.09, p.y));
			gl_FragColor = vec4(color, 1.0);
		}
	`,
};

// Estela: degradado a lo largo del tubo (UV.x) entre dos o tres colores + brillo de Fresnel.
export const trailShader = {
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
		uniform vec3 uStart;
		uniform vec3 uMid;
		uniform vec3 uEnd;
		uniform vec2 uTilt;
		varying vec3 vNormal;
		varying vec3 vView;
		varying vec2 vUv;
		void main() {
			vec3 n = normalize(vNormal);
			float fresnel = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.0);
			float t = vUv.x;
			vec3 color = t < 0.5 ? mix(uStart, uMid, t * 2.0) : mix(uMid, uEnd, t * 2.0 - 2.0 * 0.5);
			float light = 0.7 + 0.3 * max(dot(n, normalize(vec3(-0.4, 0.5, 1.0))), 0.0);
			// el brillo del borde cambia de tono con la inclinación (iridiscencia)
			vec3 sheen = 0.5 + 0.5 * cos(6.28318 * (fresnel + uTilt.x - uTilt.y + vec3(0.0, 0.33, 0.67)));
			gl_FragColor = vec4(color * light + sheen * fresnel * 0.35, 1.0);
		}
	`,
};

// Entorno que solo ve el reflejo de la bola: suelo de rayas lila, cielo oscuro y una ventana de luz
// arriba a la izquierda, como el estudio que refleja la bola del original.
export const reflectionEnvShader = {
	vertexShader: /* glsl */ `
		varying vec3 vDir;
		void main() {
			vDir = normalize(position);
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: /* glsl */ `
		varying vec3 vDir;
		void main() {
			vec3 d = normalize(vDir);
			// en el espacio de la portada, -z es "debajo" de la superficie y +z es el cielo
			float floorAmt = 1.0 - smoothstep(-0.35, 0.15, d.z);
			float stripes = smoothstep(0.0, 0.2, sin((d.x * 0.75 - d.y * 0.65) * 70.0));
			vec3 floorCol = mix(vec3(0.05, 0.02, 0.07), vec3(0.75, 0.62, 0.9), stripes);
			// oscuro arriba, gris claro abajo (como el cromo del original)
			vec3 sky = mix(vec3(0.04, 0.035, 0.05), vec3(0.62, 0.6, 0.66), 1.0 - smoothstep(-0.7, 0.6, d.y));
			vec3 color = mix(sky, floorCol, floorAmt);
			float window = smoothstep(0.93, 0.985, dot(d, normalize(vec3(-0.5, 0.6, 0.62))));
			color += vec3(1.0, 0.96, 1.0) * window * 3.0;
			gl_FragColor = vec4(color, 1.0);
		}
	`,
};

// Brillo especular que sigue al puntero, como el reflejo sobre una carta plastificada.
export const glareShader = {
	vertexShader: planeVertex,
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

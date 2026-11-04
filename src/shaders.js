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

const meshVertex = /* glsl */ `
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
`;

// Iluminación común de las piezas modeladas en Blender: difusa + especular, luz arriba a la izquierda
const lighting = /* glsl */ `
	vec3 shade(vec3 base, vec3 n, vec3 v, float gloss) {
		vec3 l = normalize(vec3(-0.45, 0.55, 0.9));
		float diffuse = 0.45 + 0.55 * max(dot(n, l), 0.0);
		float spec = pow(max(dot(reflect(-l, n), v), 0.0), 28.0) * gloss;
		return base * diffuse + spec;
	}
`;

// Rayas lila (geometría 3D de Blender). UV = posición en la imagen original.
export const stripesShader = {
	vertexShader: meshVertex,
	fragmentShader: /* glsl */ `
		uniform vec2 uTilt;
		varying vec3 vNormal;
		varying vec3 vView;
		varying vec2 vUv;
		${common}
		${lighting}
		void main() {
			vec2 p = vec2(vUv.x, 1.0 - vUv.y); // el exportador glTF invierte la V
			// Lila que se oscurece hacia arriba a la derecha (la superficie se aleja)
			float far = smoothstep(0.35, 1.15, p.x * 0.75 + (1.0 - p.y) * 0.7);
			vec3 base = mix(vec3(0.8, 0.68, 0.95), vec3(0.2, 0.09, 0.3), far);

			// Efecto holo de carta: arcoíris sutil al inclinar
			float tilt = clamp(length(uTilt) * 2.5, 0.0, 1.0);
			base += rainbow(p.x * 0.8 + p.y * 0.5 + uTilt.x * 1.2 - uTilt.y * 0.8) * tilt * 0.14 * (1.0 - far);

			vec3 color = shade(base, normalize(vNormal), normalize(vView), 0.35 * (1.0 - far));

			// Sombra de contacto de la bola
			float shadow = 1.0 - smoothstep(BALL_R * 0.9, BALL_R * 1.25, length((p - BALL - vec2(0.012, 0.018)) * vec2(1.0, 1.15)));
			color *= 1.0 - shadow * 0.55;
			// Banda oscura superior, donde va el texto
			color *= mix(0.12, 1.0, smoothstep(0.0, 0.09, p.y));
			gl_FragColor = vec4(color, 1.0);
		}
	`,
};

// Estela (geometría de Blender). UV.x = distancia a la bola a lo largo de la trayectoria:
// rojo antes de llegar, rosa → naranja → amarillo después.
export const trailShader = {
	vertexShader: meshVertex,
	fragmentShader: /* glsl */ `
		uniform vec2 uTilt;
		varying vec3 vNormal;
		varying vec3 vView;
		varying vec2 vUv;
		${lighting}
		void main() {
			float along = vUv.x;
			vec3 red = vec3(0.95, 0.08, 0.18);
			vec3 pink = vec3(1.0, 0.3, 0.55);
			vec3 orange = vec3(1.0, 0.55, 0.1);
			vec3 yellow = vec3(1.0, 0.82, 0.25);
			vec3 base = along < 0.0
				? mix(red, pink, smoothstep(-0.25, -0.1, along))
				: mix(mix(pink, orange, smoothstep(0.12, 0.25, along)), yellow, smoothstep(0.25, 0.5, along));
			vec3 n = normalize(vNormal);
			vec3 v = normalize(vView);
			// brillo de borde iridiscente que cambia con la inclinación
			float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
			vec3 sheen = 0.5 + 0.5 * cos(6.28318 * (fresnel + uTilt.x - uTilt.y + vec3(0.0, 0.33, 0.67)));
			gl_FragColor = vec4(shade(base, n, v, 0.5) + sheen * fresnel * 0.25, 1.0);
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
			float floorAmt = 1.0 - smoothstep(-0.25, 0.05, d.z);
			float stripes = smoothstep(0.0, 0.2, sin((d.x * 0.75 - d.y * 0.65) * 70.0));
			vec3 floorCol = mix(vec3(0.03, 0.01, 0.05), vec3(0.78, 0.65, 0.95), stripes);
			// cielo de estudio: negro arriba, franja clara en el horizonte (contraste de cromo)
			float horizon = exp(-pow((d.z - 0.08) / 0.12, 2.0));
			vec3 sky = mix(vec3(0.015, 0.012, 0.02), vec3(0.35, 0.33, 0.4), 1.0 - smoothstep(-0.7, 0.6, d.y));
			sky += vec3(0.85, 0.82, 0.9) * horizon;
			vec3 color = mix(sky, floorCol, floorAmt);
			// ventana de luz arriba a la izquierda (el brillo principal de la bola)
			float window = smoothstep(0.95, 0.985, dot(d, normalize(vec3(-0.5, 0.6, 0.62))));
			color += vec3(1.0, 0.97, 1.0) * window * 4.0;
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

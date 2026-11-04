// Shader de la capa de brillo (interacción web): el arte de la portada se hace en Blender.
const planeVertex = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

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

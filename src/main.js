import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { createAmbient } from "./audio.js";
import { surfaceShader, trailShader, glareShader, reflectionEnvShader } from "./shaders.js";

const MAX_TILT = { x: 0.35, y: 0.5 }; // radianes
const COVER = 2; // la portada mide 2x2 (igual que en Blender)
const MAX_DEPTH = 4; // multiplicador de profundidad en el modo "despiece"
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x1a0820, 1.2));
const key = new THREE.DirectionalLight(0xfff0f8, 1.5);
key.position.set(-2, 3, 4); // luz desde arriba a la izquierda, como en la portada
scene.add(key);

const shared = {
	uTime: { value: 0 },
	uMotion: { value: reducedMotion ? 0 : 1 },
	uTilt: { value: new THREE.Vector2() },
};

// Portada: marco, superficie de rayas, texto, modelo de Blender y brillo
const cover = new THREE.Group();
scene.add(cover);

function roundedRect(size, radius) {
	const h = size / 2;
	const shape = new THREE.Shape();
	shape.moveTo(-h + radius, -h);
	shape.lineTo(h - radius, -h);
	shape.quadraticCurveTo(h, -h, h, -h + radius);
	shape.lineTo(h, h - radius);
	shape.quadraticCurveTo(h, h, h - radius, h);
	shape.lineTo(-h + radius, h);
	shape.quadraticCurveTo(-h, h, -h, h - radius);
	shape.lineTo(-h, -h + radius);
	shape.quadraticCurveTo(-h, -h, -h + radius, -h);
	return shape;
}

const frame = new THREE.Mesh(
	new THREE.ExtrudeGeometry(roundedRect(COVER + 0.12, 0.06), {
		depth: 0.12,
		bevelEnabled: true,
		bevelThickness: 0.015,
		bevelSize: 0.015,
		bevelSegments: 3,
	}),
	new THREE.MeshStandardMaterial({ color: 0x1c0d26, metalness: 0.3, roughness: 0.45 }),
);
frame.position.z = -0.14; // cara frontal (con bisel) justo detrás de la superficie
cover.add(frame);

const surface = new THREE.Mesh(
	new THREE.PlaneGeometry(COVER, COVER),
	new THREE.ShaderMaterial({ ...surfaceShader, uniforms: shared }),
);
surface.position.z = 0.001;
cover.add(surface);

// Texto naranja de la banda superior, en una capa propia para que flote con el parallax
function titleTexture() {
	const c = document.createElement("canvas");
	c.width = 2048;
	c.height = 144;
	const ctx = c.getContext("2d");
	ctx.fillStyle = "#f2992e";
	ctx.font = "800 58px 'Helvetica Neue', Arial, sans-serif";
	ctx.textBaseline = "middle";
	ctx.letterSpacing = "2px";
	ctx.fillText("TAME IMPALA", 52, 72);
	ctx.textAlign = "right";
	ctx.fillText("CURRENTS", 2048 - 52, 72);
	const texture = new THREE.CanvasTexture(c);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}
const title = new THREE.Mesh(
	new THREE.PlaneGeometry(COVER, (COVER * 144) / 2048),
	new THREE.MeshBasicMaterial({ map: titleTexture(), transparent: true, toneMapped: false }),
);
title.position.set(0, COVER / 2 - (COVER * 144) / 2048 / 2, 0.04);
cover.add(title);

const glareUniforms = { uPointer: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0 } };
const glare = new THREE.Mesh(
	new THREE.PlaneGeometry(COVER, COVER),
	new THREE.ShaderMaterial({
		...glareShader,
		uniforms: glareUniforms,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}),
);
glare.position.z = 0.6;
glare.renderOrder = 1;
cover.add(glare);

// La bola refleja la propia portada (CubeCamera), no un entorno genérico
const reflection = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCamera = new THREE.CubeCamera(0.01, 20, reflection);
for (const face of cubeCamera.children) face.layers.enable(1);
scene.add(cubeCamera);

// Entorno solo para el reflejo (capa 1: la cámara principal no lo ve); gira con la portada
const reflectionEnv = new THREE.Mesh(
	new THREE.SphereGeometry(8, 32, 16),
	new THREE.ShaderMaterial({ ...reflectionEnvShader, side: THREE.BackSide, depthWrite: false }),
);
reflectionEnv.layers.set(1);
cover.add(reflectionEnv);

const ballMaterial = new THREE.MeshStandardMaterial({
	color: 0xffffff,
	metalness: 1,
	roughness: 0.04,
	envMap: reflection.texture,
	envMapIntensity: 1.25,
});
const trailMaterial = new THREE.ShaderMaterial({
	...trailShader,
	uniforms: {
		uTilt: shared.uTilt,
		uStart: { value: new THREE.Color(0.92, 0.08, 0.18) },
		uMid: { value: new THREE.Color(0.95, 0.1, 0.2) },
		uEnd: { value: new THREE.Color(1.0, 0.3, 0.55) },
	},
});

// Piezas cuya profundidad se amplía en el modo despiece (baseZ: altura de referencia)
const depthNodes = [{ obj: title, baseZ: 0.12, origin: title.position.z, axis: "z" }];
let ball = null;

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
loader.load("/models/currents.glb", (gltf) => {
	const model = gltf.scene;
	model.rotation.x = Math.PI / 2; // Blender exporta en Y-up; la portada mira a +Z
	model.traverse((obj) => {
		if (!obj.isMesh) return;
		const isBall = obj.name === "Ball";
		obj.material = isBall ? ballMaterial : trailMaterial;
		if (isBall) ball = obj;
		// en el GLB el eje Y local es la profundidad (Z de Blender)
		depthNodes.push({ obj, baseZ: isBall ? obj.position.y : 0.03, origin: obj.position.y, axis: "y" });
	});
	cover.add(model);
});

let depth = 1;
let depthGoal = 1;
const depthButton = document.querySelector("#depth");
function toggleDepth() {
	depthGoal = depthGoal === 1 ? MAX_DEPTH : 1;
	depthButton.setAttribute("aria-pressed", String(depthGoal !== 1));
}
depthButton.addEventListener("click", toggleDepth);

const ambient = createAmbient();
const soundButton = document.querySelector("#sound");
async function toggleSound() {
	soundButton.setAttribute("aria-pressed", String(await ambient.toggle()));
}
soundButton.addEventListener("click", toggleSound);

window.addEventListener("keydown", (e) => {
	if (e.repeat) return;
	const k = e.key.toLowerCase();
	if (k === "p") toggleDepth();
	if (k === "s") toggleSound();
});

// Interacción: ratón, táctil y giroscopio
const target = new THREE.Vector2(); // inclinación deseada, en [-1, 1]
const tilt = new THREE.Vector2();
let lastInput = -Infinity;

function setTarget(nx, ny) {
	target.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));
	lastInput = performance.now();
}

window.addEventListener("pointermove", (e) => {
	setTarget((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
});

// beta/gamma van en ejes del dispositivo en vertical: se giran según la orientación de la pantalla
let neutral = null;
function onOrientation(e) {
	if (e.gamma == null || e.beta == null) return;
	const angle = screen.orientation?.angle ?? window.orientation ?? 0;
	const rad = THREE.MathUtils.degToRad(angle);
	const x = e.gamma * Math.cos(rad) + e.beta * Math.sin(rad);
	const y = e.beta * Math.cos(rad) - e.gamma * Math.sin(rad);
	neutral ??= { x, y }; // la primera lectura es la postura de reposo
	setTarget((x - neutral.x) / 25, (y - neutral.y) / 25);
}
const resetNeutral = () => (neutral = null);
screen.orientation?.addEventListener("change", resetNeutral);
window.addEventListener("orientationchange", resetNeutral);

let listening = false;
function listenOrientation() {
	if (listening) return;
	listening = true;
	window.addEventListener("deviceorientation", onOrientation);
}

const DOE = window.DeviceOrientationEvent;
if (DOE?.requestPermission) {
	// iOS: el permiso exige un gesto de activación (click); se reintenta hasta que se conceda
	async function askPermission() {
		try {
			if ((await DOE.requestPermission()) !== "granted") return;
		} catch {
			return;
		}
		window.removeEventListener("click", askPermission);
		listenOrientation();
	}
	window.addEventListener("click", askPermission);
} else {
	listenOrientation();
}

// Bucle
function resize() {
	const { innerWidth: w, innerHeight: h } = window;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	// encaja la portada (con margen) tanto en horizontal como en vertical
	const fit = (COVER * 1.45) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
	camera.position.set(0, 0, fit / Math.min(camera.aspect, 1));
	camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// Si los primeros segundos van lentos, baja la resolución interna
let frames = 0;
const measureFrom = performance.now();
function adaptQuality() {
	if (frames === -1) return;
	frames++;
	const elapsed = performance.now() - measureFrom;
	if (elapsed < 2000) return;
	if (frames / (elapsed / 1000) < 45 && renderer.getPixelRatio() > 1) {
		renderer.setPixelRatio(1);
		resize();
	}
	frames = -1;
}

const idleGoal = new THREE.Vector2();
const ballPosition = new THREE.Vector3();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
	const t = clock.getElapsedTime();
	adaptQuality();
	const idle = !reducedMotion && performance.now() - lastInput > 2500;
	const goal = idle ? idleGoal.set(Math.sin(t * 0.5) * 0.35, Math.sin(t * 0.37) * 0.25) : target;
	tilt.lerp(goal, idle ? 0.02 : 0.08);

	depth = THREE.MathUtils.lerp(depth, depthGoal, 0.06);
	for (const { obj, baseZ, origin, axis } of depthNodes) obj.position[axis] = origin + baseZ * (depth - 1);

	cover.rotation.y = tilt.x * MAX_TILT.y;
	cover.rotation.x = tilt.y * MAX_TILT.x;

	shared.uTime.value = t;
	shared.uTilt.value.set(cover.rotation.y, cover.rotation.x);
	ambient.setTilt(cover.rotation.y, cover.rotation.x);
	glareUniforms.uPointer.value.set(0.5 + tilt.x * 0.5, 0.5 - tilt.y * 0.5);
	glareUniforms.uStrength.value = THREE.MathUtils.lerp(glareUniforms.uStrength.value, idle ? 0.08 : 0.2, 0.05);

	if (ball) {
		// captura lo que rodea a la bola (sin la bola ni el brillo) para su reflejo
		ball.getWorldPosition(ballPosition);
		cubeCamera.position.copy(ballPosition);
		ball.visible = glare.visible = false;
		cubeCamera.update(renderer, scene);
		ball.visible = glare.visible = true;
	}

	renderer.render(scene, camera);
});

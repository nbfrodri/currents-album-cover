import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { createAmbient } from "./audio.js";
import { stripesShader, trailShader, glareShader, reflectionEnvShader } from "./shaders.js";

const MAX_TILT = { x: 0.35, y: 0.5 }; // radianes
const COVER = 2; // la portada mide 2x2 (igual que en Blender)
const MAX_DEPTH = 2.2; // multiplicador del relieve en el modo Profundidad
const FLOOR_DEPTH = 0.06; // la escena queda justo detrás del marco
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;

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

// Marco hueco: un borde con grosor alrededor de la ventana por la que se ve la escena
const frameShape = roundedRect(COVER + 0.12, 0.06);
frameShape.holes.push(roundedRect(COVER, 0.001));
const frame = new THREE.Mesh(
	new THREE.ExtrudeGeometry(frameShape, {
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

// La portada es una ventana: la escena 3D queda detrás y estos planos (en el espacio de la
// portada) la recortan al marco. Se pasan a coordenadas de mundo en cada fotograma.
const windowPlanes = [
	new THREE.Plane(new THREE.Vector3(-1, 0, 0), COVER / 2),
	new THREE.Plane(new THREE.Vector3(1, 0, 0), COVER / 2),
	new THREE.Plane(new THREE.Vector3(0, -1, 0), COVER / 2),
	new THREE.Plane(new THREE.Vector3(0, 1, 0), COVER / 2),
];
const clipPlanes = windowPlanes.map((plane) => plane.clone());

// Escena de Blender, justo detrás del marco
const floor = new THREE.Group();
floor.position.z = -FLOOR_DEPTH;
cover.add(floor);

// Fondo negro entre las rayas (las rayas, la estela y la bola vienen de Blender)
const base = new THREE.Mesh(
	new THREE.PlaneGeometry(COVER * 3, COVER * 3),
	new THREE.MeshBasicMaterial({ color: 0x080310, clippingPlanes: clipPlanes }),
);
base.position.z = -0.12; // por debajo del hoyo de la bola
floor.add(base);

// Texto naranja de la banda superior, en una capa propia para que flote con el parallax
function titleTexture() {
	const c = document.createElement("canvas");
	c.width = 2048;
	c.height = 144;
	const ctx = c.getContext("2d");
	// franja oscura bajo el texto, como el borde superior del original
	const shade = ctx.createLinearGradient(0, 0, 0, c.height);
	shade.addColorStop(0, "rgba(6, 2, 10, 0.95)");
	shade.addColorStop(1, "rgba(6, 2, 10, 0)");
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, c.width, c.height);
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

// Cromo: espejo perfecto (sin rugosidad) que refleja la portada y el entorno de estudio
const ballMaterial = new THREE.MeshStandardMaterial({
	color: 0xffffff,
	metalness: 1,
	roughness: 0,
	envMap: reflection.texture,
	envMapIntensity: 1.3,
	clippingPlanes: clipPlanes,
});
const clipped = { clipping: true, clippingPlanes: clipPlanes };
const stripesMaterial = new THREE.ShaderMaterial({ ...stripesShader, ...clipped, uniforms: { uTilt: shared.uTilt } });
const trailMaterial = new THREE.ShaderMaterial({ ...trailShader, ...clipped, uniforms: { uTilt: shared.uTilt } });
const materials = { Ball: ballMaterial, Stripes: stripesMaterial, Trail: trailMaterial };

// Modo Profundidad: el relieve (ondas y hoyo de la bola) se exagera y el texto flota
const reliefNodes = [];
let ball = null;

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
loader.load("/models/currents.glb", (gltf) => {
	const model = gltf.scene;
	model.rotation.x = Math.PI / 2; // Blender exporta en Y-up; la portada mira a +Z
	model.traverse((obj) => {
		if (!obj.isMesh) return;
		obj.material = materials[obj.name];
		if (obj.name === "Ball") ball = obj;
		else reliefNodes.push(obj); // su eje Y local es la altura (Z de Blender)
	});
	floor.add(model);
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
	for (const obj of reliefNodes) obj.scale.y = depth;
	title.position.z = 0.04 + 0.12 * (depth - 1);

	cover.rotation.y = tilt.x * MAX_TILT.y;
	cover.rotation.x = tilt.y * MAX_TILT.x;

	shared.uTime.value = t;
	shared.uTilt.value.set(cover.rotation.y, cover.rotation.x);
	ambient.setTilt(cover.rotation.y, cover.rotation.x);
	glareUniforms.uPointer.value.set(0.5 + tilt.x * 0.5, 0.5 - tilt.y * 0.5);
	glareUniforms.uStrength.value = THREE.MathUtils.lerp(glareUniforms.uStrength.value, idle ? 0.08 : 0.2, 0.05);

	cover.updateMatrixWorld();
	windowPlanes.forEach((plane, i) => clipPlanes[i].copy(plane).applyMatrix4(cover.matrixWorld));

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

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createAmbient } from "./audio.js";
import { linesShader, foilShader, glareShader } from "./shaders.js";

const MAX_TILT = { x: 0.35, y: 0.5 }; // radianes
const COVER = 2; // la portada mide 2x2 (igual que en Blender)
const MAX_DEPTH = 4; // multiplicador de profundidad en el modo "despiece"
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

const shared = {
	uTime: { value: 0 },
	uTilt: { value: new THREE.Vector2() },
	uPulse: { value: reducedMotion ? 0 : 1 },
};

// Portada: marco + lámina holo + modelo de Blender + brillo
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
	new THREE.MeshPhysicalMaterial({ color: 0x140818, metalness: 0.6, roughness: 0.35, clearcoat: 1 }),
);
frame.position.z = -0.14; // cara frontal (con bisel) justo detrás de la lámina
cover.add(frame);

const foil = new THREE.Mesh(
	new THREE.PlaneGeometry(COVER, COVER),
	new THREE.ShaderMaterial({ ...foilShader, uniforms: shared }),
);
foil.position.z = 0.001;
cover.add(foil);

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
glare.position.z = 0.65;
glare.renderOrder = 1;
cover.add(glare);

const linesMaterial = new THREE.ShaderMaterial({ ...linesShader, uniforms: shared });
const ballMaterial = new THREE.MeshPhysicalMaterial({
	color: 0xffffff,
	metalness: 1,
	roughness: 0.08,
	iridescence: 1,
	iridescenceIOR: 1.6,
	iridescenceThicknessRange: [200, 800],
});

// Capas cuya profundidad se amplía en el modo despiece; baseZ es su profundidad en Blender
const depthNodes = [];

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
loader.load("/models/currents.glb", (gltf) => {
	const model = gltf.scene;
	model.rotation.x = Math.PI / 2; // Blender exporta en Y-up; la portada mira a +Z
	model.traverse((obj) => {
		if (!obj.isMesh) return;
		const isLayer = obj.name.startsWith("Layer_");
		obj.material = isLayer ? linesMaterial : ballMaterial;
		// en el GLB el eje Y local es la profundidad (Z de Blender)
		const baseZ = isLayer ? 0.02 + Number(obj.name.slice(6)) * 0.06 : obj.position.y;
		depthNodes.push({ obj, baseZ, origin: obj.position.y });
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
	const key = e.key.toLowerCase();
	if (key === "p") toggleDepth();
	if (key === "s") toggleSound();
});

const key = new THREE.DirectionalLight(0xffe2f0, 1.5);
key.position.set(2, 3, 4);
scene.add(key);

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

function onOrientation(e) {
	if (e.gamma == null || e.beta == null) return;
	setTarget(e.gamma / 30, (e.beta - 45) / 30);
}

window.addEventListener(
	"pointerdown",
	async () => {
		// iOS exige pedir permiso al giroscopio tras un gesto del usuario
		const DOE = window.DeviceOrientationEvent;
		if (DOE?.requestPermission) {
			try {
				if ((await DOE.requestPermission()) !== "granted") return;
			} catch {
				return;
			}
		}
		window.addEventListener("deviceorientation", onOrientation);
	},
	{ once: true },
);
if (!window.DeviceOrientationEvent?.requestPermission) {
	window.addEventListener("deviceorientation", onOrientation);
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
let slowSince = performance.now();
function adaptQuality() {
	if (frames === -1) return;
	frames++;
	const elapsed = performance.now() - slowSince;
	if (elapsed < 2000) return;
	if (frames / (elapsed / 1000) < 45 && renderer.getPixelRatio() > 1) {
		renderer.setPixelRatio(1);
		resize();
	}
	frames = -1;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
	const t = clock.getElapsedTime();
	adaptQuality();
	const idle = !reducedMotion && performance.now() - lastInput > 2500;
	const goal = idle ? new THREE.Vector2(Math.sin(t * 0.5) * 0.35, Math.sin(t * 0.37) * 0.25) : target;
	tilt.lerp(goal, idle ? 0.02 : 0.08);

	depth = THREE.MathUtils.lerp(depth, depthGoal, 0.06);
	for (const { obj, baseZ, origin } of depthNodes) obj.position.y = origin + baseZ * (depth - 1);

	cover.rotation.y = tilt.x * MAX_TILT.y;
	cover.rotation.x = tilt.y * MAX_TILT.x;

	shared.uTime.value = t;
	shared.uTilt.value.set(cover.rotation.y, cover.rotation.x);
	ambient.setTilt(cover.rotation.y, cover.rotation.x);
	glareUniforms.uPointer.value.set(0.5 + tilt.x * 0.5, 0.5 - tilt.y * 0.5);
	glareUniforms.uStrength.value = THREE.MathUtils.lerp(glareUniforms.uStrength.value, idle ? 0.12 : 0.3, 0.05);

	renderer.render(scene, camera);
});

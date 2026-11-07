import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createAmbient } from "./audio.js";
import { createPlayer } from "./player.js";
import { backRowCenter, backTrackAt } from "./back.js";
import { mountPanel } from "./panel.js";
import { glareShader } from "./shaders.js";
import { TRACKS } from "./tracks.js";
import { drawVisualizer } from "./visualizer.js";
import { addWaves, trailUniforms, trailWaves, waveUniforms } from "./waves.js";

const MAX_TILT = { x: 0.35, y: 0.5 }; // radianes
const COVER = 2; // la portada mide 2x2 (igual que en Blender)
const FLOOR_DEPTH = 0.14; // la superficie queda dentro de la caja del marco; el relieve y el texto suben hasta su borde
const ALBUM_DEPTH = 0.3; // grosor del cuerpo del álbum de Blender (2 · BACK_DEPTH), con la contraportada
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionPreference.matches;
motionPreference.addEventListener("change", (e) => { reducedMotion = e.matches; });

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

// Cámara libre: arrastrar gira, la rueda (o pellizcar) acerca y el botón derecho (o dos dedos) desplaza
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.45; // sin límite horizontal: se puede dar la vuelta para ver la contraportada
controls.minPolarAngle = 0.17;
controls.maxPolarAngle = Math.PI - 0.17;
let dragging = false;
controls.addEventListener("start", () => (dragging = true));
controls.addEventListener("end", () => (dragging = false));

scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x1a0820, 1.2));
const key = new THREE.DirectionalLight(0xfff0f8, 1.5);
key.position.set(-2, 3, 4); // luz desde arriba a la izquierda, como en la portada
scene.add(key);
const backLight = new THREE.DirectionalLight(0xe8dcff, 0.8); // la contraportada también se ve
backLight.position.set(1, 2, -4);
scene.add(backLight);

// Portada: marco, modelo de Blender (rayas, estela, bola, fondo y texto) y brillo
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
		depth: FLOOR_DEPTH + ALBUM_DEPTH - 0.02,
		bevelEnabled: true,
		bevelThickness: 0.015,
		bevelSize: 0.015,
		bevelSegments: 3,
	}),
	new THREE.MeshStandardMaterial({ color: 0x1c0d26, metalness: 0.3, roughness: 0.45 }),
);
frame.position.z = -FLOOR_DEPTH - ALBUM_DEPTH; // cubre los cantos del álbum, de la contraportada a la superficie
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

// Reflejo del cromo: panorámica renderizada en Blender desde el centro de la bola
const ballEnv = new THREE.TextureLoader().load("/models/ball_env.jpg");
ballEnv.mapping = THREE.EquirectangularReflectionMapping;
ballEnv.colorSpace = THREE.SRGBColorSpace;

// Piezas de Blender con interacción
const parts = { ball: null, body: null, back: null, stripes: null, trail: null, TitleBand: null, TitleAlbum: null };

// Franja dorada sobre el tema que suena en el tracklist de la contraportada
const backMarker = new THREE.Mesh(
	new THREE.PlaneGeometry(1, 1),
	new THREE.MeshBasicMaterial({ color: 0xf2b544, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
);
backMarker.rotation.x = Math.PI / 2; // en el plano del reverso del modelo (xz)
backMarker.visible = false;
function placeBackMarker(index) {
	const rows = parts.back?.userData.track_rows;
	if (!rows) return;
	const { x, z } = backRowCenter(index, rows);
	backMarker.scale.set(rows.half * 2 + 0.08, rows.step * 0.9, 1);
	backMarker.position.set(x, rows.y - 0.003, z); // justo por fuera del reverso
	backMarker.visible = true;
}
let model = null;

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
const modelStatus = document.querySelector("#model-status");
loader.load("/models/currents.glb", (gltf) => {
	model = gltf.scene;
	model.rotation.x = Math.PI / 2; // Blender exporta en Y-up; la portada mira a +Z
	model.traverse((obj) => {
		if (!obj.isMesh) return;
		// materiales y colores vienen de Blender; aquí solo se recortan al marco y se animan
		obj.material.clippingPlanes = clipPlanes;
		if (obj.name === "Ball") {
			parts.ball = obj;
			obj.material.envMap = ballEnv;
			obj.material.envMapIntensity = 1.0;
		}
		if (obj.name === "Body") parts.body = obj;
		if (obj.name === "BackArt") parts.back = obj;
		if (obj.name === "TitleBand" || obj.name === "TitleAlbum") parts[obj.name] = obj;
		if (obj.name === "Stripes") {
			parts.stripes = obj;
			obj.material.emissive.set(0xc9aef2);
			obj.material.emissiveIntensity = 0;
			addWaves(obj.material);
		}
		if (obj.name === "Trail") {
			parts.trail = obj;
			const along = obj.geometry.attributes.uv;
			let min = Infinity, max = -Infinity;
			for (let i = 0; i < along.count; i++) {
				min = Math.min(min, along.getX(i));
				max = Math.max(max, along.getX(i));
			}
			trailUniforms.uRange.value.set(min, max);
			trailWaves(obj.material);
		}
	});
	backMarker.material.clippingPlanes = clipPlanes;
	model.add(backMarker);
	floor.add(model);
	modelStatus.textContent = "";
}, undefined, () => {
	modelStatus.textContent = "No se pudo cargar la portada. Recarga la página para reintentar.";
});

const ambient = createAmbient();
const soundButton = document.querySelector("#sound");
const soundStatus = document.querySelector("#sound-status");
async function toggleSound() {
	try {
		if (!ambient.playing) player.pause(); // el ambiente y el disco no suenan a la vez
		soundButton.setAttribute("aria-pressed", String(await ambient.toggle()));
		soundStatus.textContent = "";
	} catch {
		soundButton.setAttribute("aria-pressed", String(ambient.playing));
		soundStatus.textContent = "No se pudo cambiar el sonido. Pulsa Sonido para reintentar.";
	}
}
soundButton.addEventListener("click", toggleSound);

// Reproductor y tracklist
const player = createPlayer(TRACKS);
let started = false; // la estela solo se tiñe cuando ya ha sonado algo
const viz = mountPanel(document, player, TRACKS, (state) => {
	started ||= state.playing;
	if (started) placeBackMarker(state.index);
	trailUniforms.uTint.value.set(TRACKS[state.index].tint);
	const duration = Number.isFinite(state.duration) ? state.duration : 0;
	trailUniforms.uProgress.value = duration ? state.current / duration : 0;
	if (state.playing && ambient.playing) toggleSound();
});
const tracklist = document.querySelector("#tracklist");
const tracklistButton = document.querySelector("#tracklist-toggle");
function setTracklist(open) {
	tracklist.hidden = !open;
	tracklistButton.setAttribute("aria-expanded", String(open));
}
tracklistButton.addEventListener("click", () => setTracklist(tracklist.hidden));

window.addEventListener("keydown", (e) => {
	if (e.repeat || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
	if (e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
	const k = e.key.toLowerCase();
	if (k === "s") toggleSound();
	if (k === "r") controls.reset();
	if (k === "t") setTracklist(tracklist.hidden);
	if (k === "p") player.toggle();
	if (k === "n") player.next();
	if (k === "b") player.prev();
	if (k === "m") player.toggleMute();
	if (k === "escape" && !tracklist.hidden) setTracklist(false);
});

// Piezas clicables de la portada: la bola reproduce o pausa, CURRENTS abre el tracklist y
// TAME IMPALA pasa al tema siguiente
function activate(name, index) {
	if (name === "track") return player.play(index);
	if (name === "ball") return player.toggle();
	if (name === "TitleAlbum") return setTracklist(tracklist.hidden);
	if (name === "TitleBand") return player.next();
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pickBox = new THREE.Box3();
const hitPoint = new THREE.Vector3();
// Lo primero que toca el rayo; el cuerpo del álbum tapa lo que hay detrás (p. ej. vista desde atrás)
function pickAt(clientX, clientY) {
	if (!model) return null;
	pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
	raycaster.setFromCamera(pointerNdc, camera);
	const hits = raycaster.intersectObjects([parts.ball, parts.body].filter(Boolean), false);
	let best = hits[0] ? { name: hits[0].object === parts.ball ? "ball" : null, distance: hits[0].distance } : null;
	if (hits[0]?.object === parts.body && hits[0].face.normal.y < -0.5) {
		// el reverso del cuerpo: ¿qué fila del tracklist de la contraportada?
		const index = backTrackAt(parts.body.worldToLocal(hitPoint.copy(hits[0].point)), parts.back?.userData.track_rows);
		if (index >= 0) best = { name: "track", index, distance: hits[0].distance };
	}
	for (const name of ["TitleBand", "TitleAlbum"]) {
		if (!parts[name]) continue;
		pickBox.setFromObject(parts[name]).expandByScalar(0.03); // el texto es fino: caja algo mayor
		if (!raycaster.ray.intersectBox(pickBox, hitPoint)) continue;
		const distance = hitPoint.distanceTo(raycaster.ray.origin);
		if (!best || distance < best.distance) best = { name, distance };
	}
	if (hits[0]) {
		model.worldToLocal(hitPoint.copy(hits[0].point));
		waveUniforms.uPointer.value.copy(hitPoint); // la onda del ratón nace donde toca la superficie
	}
	return { name: best?.name ?? null, index: best?.index, overCover: hits.length > 0 };
}

let pointerOverCover = false;
let downAt = null;
canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener("click", (e) => {
	if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // era un arrastre
	const hit = pickAt(e.clientX, e.clientY);
	if (hit?.name) activate(hit.name, hit.index);
});
canvas.addEventListener("pointermove", (e) => {
	if (dragging) return;
	const hit = pickAt(e.clientX, e.clientY);
	pointerOverCover = Boolean(hit?.overCover);
	canvas.classList.toggle("hovering", Boolean(hit?.name));
});
canvas.addEventListener("pointerleave", () => (pointerOverCover = false));

// Inclinación de la portada (efecto carta): solo con el giroscopio del móvil. Con ratón, la
// portada únicamente se mueve al arrastrar, para que no se escape al ir a hacer clic.
const target = new THREE.Vector2(); // inclinación deseada, en [-1, 1]
const tilt = new THREE.Vector2();

function setTarget(nx, ny) {
	target.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));
}

// beta/gamma van en ejes del dispositivo en vertical: se giran según la orientación de la pantalla
let neutral = null;
function onOrientation(e) {
	if (!Number.isFinite(e.gamma) || !Number.isFinite(e.beta)) return;
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
	// iOS: el permiso exige un gesto de activación; no repetir una denegación explícita.
	let requesting = false;
	async function askPermission() {
		if (requesting) return;
		requesting = true;
		try {
			const permission = await DOE.requestPermission();
			window.removeEventListener("click", askPermission);
			if (permission === "granted") listenOrientation();
		} catch {
			// Un gesto sin activación válida permite reintentar con el siguiente click.
		} finally {
			requesting = false;
		}
	}
	window.addEventListener("click", askPermission);
} else {
	listenOrientation();
}

document.querySelector("#reset").addEventListener("click", () => controls.reset());

// Bucle
let framed = false;
function resize() {
	const { innerWidth: w, innerHeight: h } = window;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	// distancia que encaja la portada (con margen) tanto en horizontal como en vertical
	const fit = (COVER * 1.45) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(camera.aspect, 1);
	controls.minDistance = fit * 0.35;
	controls.maxDistance = fit * 2.5;
	camera.far = Math.max(50, controls.maxDistance + COVER * 2);
	camera.updateProjectionMatrix();
	if (!framed) {
		// solo la primera vez: después se respeta el zoom del usuario
		camera.position.set(0, 0, fit);
		controls.saveState();
		framed = true;
	}
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

const clipNormalMatrix = new THREE.Matrix3();
const startedAt = performance.now();
renderer.setAnimationLoop(() => {
	const t = (performance.now() - startedAt) / 1000;
	adaptQuality();
	controls.update();
	tilt.lerp(target, 0.08);

	cover.rotation.y = tilt.x * MAX_TILT.y;
	cover.rotation.x = tilt.y * MAX_TILT.x;

	ambient.setTilt(cover.rotation.y, cover.rotation.x);
	glareUniforms.uPointer.value.set(0.5 + tilt.x * 0.5, 0.5 - tilt.y * 0.5);
	glareUniforms.uStrength.value = THREE.MathUtils.lerp(glareUniforms.uStrength.value, 0.15, 0.05);

	cover.updateMatrixWorld();
	clipNormalMatrix.getNormalMatrix(cover.matrixWorld);
	for (let i = 0; i < windowPlanes.length; i++) {
		clipPlanes[i].copy(windowPlanes[i]).applyMatrix4(cover.matrixWorld, clipNormalMatrix);
	}

	// música: graves que levantan las ondas y laten en la bola, brillo con los medios, visualizador
	const { bass, mid, freq } = player.levels();
	waveUniforms.uTime.value = t;
	waveUniforms.uBass.value = THREE.MathUtils.lerp(waveUniforms.uBass.value, reducedMotion ? 0 : bass, 0.3);
	waveUniforms.uHover.value = THREE.MathUtils.lerp(waveUniforms.uHover.value, pointerOverCover && !reducedMotion ? 1 : 0, 0.08);
	trailUniforms.uActive.value = THREE.MathUtils.lerp(trailUniforms.uActive.value, started ? 1 : 0, 0.05);
	if (parts.stripes) parts.stripes.material.emissiveIntensity = mid * 0.1;
	if (parts.ball) parts.ball.scale.setScalar(1 + waveUniforms.uBass.value * 0.06);
	if (!tracklist.hidden) drawVisualizer(viz.context, viz.width, viz.height, freq, t);

	// el entorno del reflejo gira con la portada
	if (parts.ball) parts.ball.material.envMapRotation.copy(cover.rotation);

	renderer.render(scene, camera);
});

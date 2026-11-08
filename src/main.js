import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPlayer } from "./player.js";
import { createBackdrop } from "./backdrop.js";
import { backRowCenter, backTrackAt } from "./back.js";
import { ballSwell, createBeat } from "./beat.js";
import { mountPanel } from "./panel.js";
import { mountSheet } from "./sheet.js";
import { createHalo } from "./halo.js";
import { createIdle } from "./idle.js";
import { createLetters } from "./letters.js";
import { glareShader } from "./shaders.js";
import { TRACKS } from "./tracks.js";
import { drawVisualizer } from "./visualizer.js";
import { addTrailPoint, addWaves, trailUniforms, trailWaves, waveUniforms } from "./waves.js";

const MAX_TILT = { x: 0.35, y: 0.5 }; // radianes
const COVER = 2; // la portada mide 2x2 (igual que en Blender)
const FLOOR_DEPTH = 0.14; // la superficie queda dentro de la caja del marco; el relieve y el texto suben hasta su borde
const ALBUM_DEPTH = 0.3; // grosor del cuerpo del álbum de Blender (2 · BACK_DEPTH), con la contraportada
const GLASS_ROOM = 0.06; // el marco sigue por detrás para encajar la placa de cristal (GLASS_* en Blender)
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
const backdrop = createBackdrop(); // fondo de rayas que ondulan con la música
scene.add(backdrop.mesh);

// Cámara: arrastrar con el botón izquierdo gira y la rueda (o pellizcar) acerca; sin desplazar la vista
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false; // el botón derecho no hace nada: solo girar y acercar
controls.rotateSpeed = 0.45; // sin límite horizontal: se puede dar la vuelta para ver la contraportada
controls.minPolarAngle = 0.17;
controls.maxPolarAngle = Math.PI - 0.17;
let dragging = false;
const idle = createIdle(); // tras unos segundos sin entrada, la portada se balancea sola
controls.addEventListener("start", () => {
	dragging = true;
	idle.poke();
});
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
		depth: FLOOR_DEPTH + ALBUM_DEPTH + GLASS_ROOM - 0.02,
		bevelEnabled: true,
		bevelThickness: 0.015,
		bevelSize: 0.015,
		bevelSegments: 3,
	}),
	new THREE.MeshStandardMaterial({ color: 0x1c0d26, metalness: 0.3, roughness: 0.45 }),
);
frame.position.z = -FLOOR_DEPTH - ALBUM_DEPTH - GLASS_ROOM; // cubre los cantos, del cristal trasero a la superficie
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
const ballEnv = new THREE.TextureLoader().load("models/ball_env.jpg");
ballEnv.mapping = THREE.EquirectangularReflectionMapping;
ballEnv.colorSpace = THREE.SRGBColorSpace;

// Piezas de Blender con interacción
const parts = { ball: null, body: null, back: null, glass: null, stripes: null, trail: null };

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
	const { x, z, height } = backRowCenter(index, rows);
	backMarker.scale.set(rows.half * 2 + 0.08, height, 1);
	backMarker.position.set(x, rows.y - 0.003, z); // justo por fuera del reverso
	backMarker.visible = true;
}
let model = null;
const letters = createLetters(); // títulos de la portada y temas del reverso, que siguen a la música
const halo = createHalo(clipPlanes); // resplandor y anillo del latido alrededor de la bola

// Pantalla de carga: una bola cromada que respira mientras llega el modelo. Después la portada
// toma el relevo con un giro suave; con movimiento reducido no se fuerza la espera.
const LOADER_MIN = 1.2; // segundos: que la carga no sea un parpadeo con el modelo en caché
const INTRO = 3.2; // segundos de giro pausado, después de los primeros 0,2 s del fundido
const loadingScreen = document.querySelector("#loader");
const loadingLabel = document.querySelector("#loader-label");
const loadingFill = document.querySelector("#loader-fill");
let introAt = null; // momento en que empieza la entrada (null: aún cargando)

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("draco/"));
loader.load("models/currents.glb", (gltf) => {
	model = gltf.scene;
	model.rotation.x = Math.PI / 2; // Blender exporta en Y-up; la portada mira a +Z
	model.traverse((obj) => {
		if (!obj.isMesh) return;
		// materiales y colores vienen de Blender; aquí solo se recortan al marco y se animan
		obj.material.clippingPlanes = clipPlanes;
		if (obj.name === "Ball") {
			parts.ball = obj;
			obj.geometry.computeBoundingSphere();
			obj.userData.restY = obj.position.y; // altura en reposo (y = arriba en el modelo)
			obj.userData.radius = obj.geometry.boundingSphere.radius;
			waveUniforms.uBall.value.set(obj.position.x, obj.position.z);
			obj.material.envMap = ballEnv;
			obj.material.envMapIntensity = 1.0;
			halo.place(obj.position, obj.userData.radius);
		}
		if (obj.name === "Body") parts.body = obj;
		if (obj.material.name === "Title" || obj.material.name === "BackTitle") letters.add(obj, { bump: !obj.name.startsWith("BackSong") }); // los temas solo brillan
		if (obj.name === "BackGlass") {
			// lámina de plástico o cristal sobre la contraportada: refleja el mismo entorno que la bola
			parts.glass = obj;
			obj.material.envMap = ballEnv;
			obj.material.envMapIntensity = 0.7; // reflejo discreto: el entorno es lila y lo teñía todo
			obj.material.depthWrite = false;
			obj.renderOrder = 2; // después de la franja del tema que suena
		}
		if (obj.name === "Stripes") {
			parts.stripes = obj;
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
	// BackArt tiene varios materiales: llega como un grupo, y sus extras (las filas) están en él
	parts.back = model.getObjectByName("BackArt");
	backMarker.material.clippingPlanes = clipPlanes;
	model.add(backMarker, halo.mesh);
	floor.add(model);
	loadingFill.style.setProperty("--loaded", "1");
}, (e) => {
	if (e.lengthComputable) loadingFill.style.setProperty("--loaded", String(e.loaded / e.total));
}, () => {
	loadingScreen.classList.toggle("failed", true);
	loadingLabel.textContent = "No se pudo cargar la portada. Recarga la página para reintentar.";
});

// Reproductor y tracklist
const player = createPlayer(TRACKS);
let started = false; // la franja de la contraportada aparece cuando ya ha sonado algo
const sheet = mountSheet(document, TRACKS);
const panel = mountPanel(document, player, TRACKS, (state) => {
	sheet.update(state);
	started ||= state.playing;
	if (started) placeBackMarker(state.index);
});
const tracklist = document.querySelector("#tracklist");
const setTracklist = panel.setOpen;

// Reposo: sin entrada durante unos segundos, la portada se balancea sola mirando al frente
const poke = () => idle.poke();
for (const name of ["pointerdown", "pointermove", "wheel", "touchstart"]) window.addEventListener(name, poke, { passive: true });

window.addEventListener("keydown", (e) => {
	poke();
	if (e.repeat || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
	if (e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
	const k = e.key.toLowerCase();
	if (k === "r") controls.reset();
	if (k === "t") setTracklist(tracklist.hidden);
	if (k === "p") player.toggle();
	// Espacio: reproducir o pausar, salvo sobre un botón o enlace (ahí ya lo activa el navegador)
	if (e.key === " " && !/^(BUTTON|A|SUMMARY)$/.test(e.target?.tagName)) {
		e.preventDefault();
		player.toggle();
	}
	if (k === "n") player.next();
	if (k === "b") player.prev();
	if (k === "m") player.toggleMute();
	if (e.key === "?") document.querySelector("#help").togglePopover?.();
	if (k === "escape" && !tracklist.hidden) panel.collapse();
});

// Piezas clicables de la portada: la bola reproduce o pausa y cada tema de la contraportada suena
function activate(name, index) {
	if (name === "track") return player.play(index);
	if (name === "ball") {
		panel.reveal();
		return player.toggle();
	}
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
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
	const front = hits[0] && hits[0].object === parts.body && hits[0].face.normal.y > 0.5;
	if (front) {
		model.worldToLocal(hitPoint.copy(hits[0].point));
		if (!reducedMotion && !dragging) addTrailPoint(hitPoint, waveUniforms.uTime.value); // ondas del rastro del ratón
	}
	return { name: best?.name ?? null, index: best?.index };
}

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
	// en línea: OrbitControls deja cursor: auto en el estilo del lienzo y taparía una clase
	canvas.style.cursor = hit?.name ? "pointer" : "auto";
});

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


// Bucle
let framed = false;
function resize() {
	const { innerWidth: w, innerHeight: h } = window;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	// distancia que encaja la portada (con margen) tanto en horizontal como en vertical
	const fit = (COVER * 1.45) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(camera.aspect, 1);
	controls.minDistance = fit * 0.35;
	controls.maxDistance = fit; // no se aleja más que el encuadre inicial: la portada no se pierde
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

// En reposo la cámara vuelve poco a poco a la vista de frente (por el camino corto) y al zoom
// inicial: así el balanceo siempre enseña la portada entera y por delante.
const orbit = new THREE.Spherical();
const offset = new THREE.Vector3();
function returnToFront(weight, dt) {
	if (!controls.target0) return;
	const k = Math.min(1, dt * 0.9) * weight;
	controls.target.lerp(controls.target0, k);
	orbit.setFromVector3(offset.copy(camera.position).sub(controls.target));
	const turn = Math.atan2(Math.sin(-orbit.theta), Math.cos(-orbit.theta)); // de theta a 0
	orbit.theta += turn * k;
	orbit.phi += (Math.PI / 2 - orbit.phi) * k;
	orbit.radius += (controls.position0.distanceTo(controls.target0) - orbit.radius) * k;
	camera.position.setFromSpherical(orbit).add(controls.target);
}

const clipNormalMatrix = new THREE.Matrix3();
const startedAt = performance.now();
const beat = createBeat();
let lastFrame = 0;
renderer.setAnimationLoop(() => {
	const t = (performance.now() - startedAt) / 1000;
	const dt = Math.min(t - lastFrame, 0.1);
	lastFrame = t;
	adaptQuality();
	controls.update();
	tilt.lerp(target, 0.08);

	// entrada: cuando el modelo está listo, la portada llega girando desde la contraportada
	if (introAt === null && model && (reducedMotion || t >= LOADER_MIN)) {
		introAt = t;
		loadingScreen.classList.toggle("done", true);
	}
	const intro = introAt === null || reducedMotion ? 1 : Math.max(0, Math.min((t - introAt - 0.2) / INTRO, 1));
	const ease = intro * intro * (3 - 2 * intro); // arranque y llegada sin aceleraciones bruscas
	cover.scale.setScalar(0.82 + 0.18 * ease);
	const rest = reducedMotion ? { angle: 0, weight: 0 } : idle.update(dt);
	if (rest.weight > 0 && !dragging) returnToFront(rest.weight, dt);
	cover.rotation.y = tilt.x * MAX_TILT.y - (1 - ease) * Math.PI * 0.55 + rest.angle;
	cover.rotation.x = tilt.y * MAX_TILT.x;

	glareUniforms.uPointer.value.set(0.5 + tilt.x * 0.5, 0.5 - tilt.y * 0.5);
	glareUniforms.uStrength.value = THREE.MathUtils.lerp(glareUniforms.uStrength.value, 0.15, 0.05);

	cover.updateMatrixWorld();
	clipNormalMatrix.getNormalMatrix(cover.matrixWorld);
	for (let i = 0; i < windowPlanes.length; i++) {
		clipPlanes[i].copy(windowPlanes[i]).applyMatrix4(cover.matrixWorld, clipNormalMatrix);
	}

	// música: graves que levantan las ondas y laten en la bola, brillo con los medios, visualizador
	const { kick, bass, mid, freq } = player.levels();
	waveUniforms.uTime.value = t;
	waveUniforms.uBass.value = THREE.MathUtils.lerp(waveUniforms.uBass.value, reducedMotion ? 0 : bass, 0.3);
	// la bola late con cada golpe de graves (bump rápido que se relaja) y respira con el volumen
	const pulse = reducedMotion ? 0 : beat.update(kick, dt);
	if (parts.ball) {
		// late hacia arriba: la base sigue en el fondo del hoyo y nunca asoma por la contraportada
		const scale = ballSwell(pulse) + waveUniforms.uBass.value * 0.015;
		parts.ball.scale.setScalar(scale);
		parts.ball.position.y = parts.ball.userData.restY + parts.ball.userData.radius * (scale - 1);
	}
	halo.update(pulse, reducedMotion ? 99 : beat.age);
	waveUniforms.uPulse.value = pulse;
	waveUniforms.uBeatAge.value = beat.age;
	letters.update({ dt, playing: player.state().playing, bass, mid, pulse, motion: !reducedMotion });
	backdrop.update({ dt, bass, mid, pulse, beatAge: beat.age, aspect: camera.aspect, motion: !reducedMotion });
	panel.tick(); // la barra de progreso avanza fluida, no a saltos de timeupdate
	if (!tracklist.hidden) drawVisualizer(panel.context, panel.width, panel.height, freq, t);

	// el entorno del reflejo gira con la portada
	if (parts.ball) parts.ball.material.envMapRotation.copy(cover.rotation);
	if (parts.glass) parts.glass.material.envMapRotation.copy(cover.rotation);

	renderer.render(scene, camera);
});

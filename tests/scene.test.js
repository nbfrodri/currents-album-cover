import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import * as shaders from "../src/shaders.js";
import * as tracks from "../src/tracks.js";
import * as panel from "../src/panel.js";
import * as waves from "../src/waves.js";
import * as beat from "../src/beat.js";
import * as back from "../src/back.js";
import * as backdrop from "../src/backdrop.js";

function setup(orientation) {
	const listeners = new Map();
	const stats = { resets: 0, player: [] };
	const elements = new Map();
	const element = () => ({
		classList: { toggle() {} },
		style: { setProperty() {} },
		append() {},
		setAttribute(name, value) { this[name] = value; },
		addEventListener(name, callback) { this[name] = callback; },
		getContext: () => ({
			createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText() {},
			clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
		}),
	});
	const preference = { matches: true, addEventListener(name, callback) { this[name] = callback; } };
	const window = {
		innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
		DeviceOrientationEvent: orientation,
		matchMedia: () => preference,
		addEventListener(name, callback) { listeners.set(name, callback); },
		removeEventListener(name) { listeners.delete(name); },
	};
	const document = {
		createElement: element,
		querySelector(selector) {
			if (!elements.has(selector)) elements.set(selector, element());
			return elements.get(selector);
		},
	};
	class Renderer {
		setPixelRatio() {}
		setSize() {}
		setAnimationLoop(callback) { this.frame = callback; }
		render() {}
	}
	class Loader {
		setDRACOLoader() { return this; }
		setDecoderPath() { return this; }
		load() { return new THREE.Texture(); }
	}
	class Controls {
		constructor(camera) { this.camera = camera; this.listeners = {}; }
		addEventListener(name, callback) { this.listeners[name] = callback; }
		update() {}
		saveState() {}
		reset() { stats.resets++; }
	}
	const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");
	const context = vm.createContext({
		THREE: { ...THREE, WebGLRenderer: Renderer, TextureLoader: Loader }, ...shaders,
		GLTFLoader: Loader, DRACOLoader: Loader, OrbitControls: Controls,
		...tracks, ...panel, ...waves, ...beat, ...back, ...backdrop,
		drawVisualizer() {},
		createPlayer() {
			let listener = null, playing = false, index = 0;
			const state = () => ({ index, playing, source: "preview", failed: false, current: 0, duration: 30, volume: 1, muted: false });
			const call = (name, value) => async () => {
				stats.player.push(name);
				if (value !== undefined) playing = value(playing);
				listener?.(state());
			};
			return {
				toggle: call("toggle", (p) => !p), prev: call("prev"), play: call("play", () => true),
				next: async () => { index++; playing = true; await call("next")(); },
				pause: call("pause", () => false), seek() {}, setVolume() {}, toggleMute() {}, state,
				levels: () => ({ kick: 0, bass: 0, mid: 0, high: 0, freq: null }),
				onChange(fn) { listener = fn; },
			};
		},
		window, document, screen: {}, performance, console,
	});
	vm.runInContext(source, context);
	return { run: (code) => vm.runInContext(code, context), listeners, window, preference, elements, stats };
}

test("la cámara conserva la portada dentro del plano lejano en ventanas estrechas", () => {
	const app = setup();
	app.window.innerWidth = 80;
	app.window.innerHeight = 1600;
	app.run("resize()");
	assert.ok(app.run("camera.far > controls.maxDistance + COVER"));
});

test("los atajos no interceptan combinaciones del navegador ni campos de texto", () => {
	const app = setup();
	const key = app.listeners.get("keydown");
	key({ key: "p", ctrlKey: true });
	key({ key: "p", target: { tagName: "INPUT" } });
	assert.deepEqual(app.stats.player, []);
	key({ key: "p" });
	assert.deepEqual(app.stats.player, ["toggle"]);
	key({ key: "r" });
	assert.equal(app.stats.resets, 1);
});

test("la tecla T abre y cierra el reproductor; Escape y el botón de cerrar lo cierran", () => {
	const app = setup();
	const panel = app.elements.get("#tracklist");
	panel.hidden = true;
	const key = app.listeners.get("keydown");
	key({ key: "t" });
	assert.equal(panel.hidden, false);
	key({ key: "Escape" });
	assert.equal(panel.hidden, true);
	key({ key: "t" });
	app.elements.get("#player-close").click();
	assert.equal(panel.hidden, true);
	key({ key: "t", metaKey: true });
	assert.equal(panel.hidden, true);
	assert.equal(app.elements.has("#tracklist-toggle"), false); // sin botones arriba
	assert.equal(app.elements.has("#reset"), false);
});

test("al empezar un tema se abre el reproductor; cerrado sigue así hasta el siguiente tema", async () => {
	const app = setup();
	const panel = app.elements.get("#tracklist");
	panel.hidden = true;
	await app.run("player.toggle()");
	assert.equal(panel.hidden, false);
	app.elements.get("#player-close").click();
	await app.run("player.toggle(); player.toggle()"); // pausa y sigue el mismo tema
	assert.equal(panel.hidden, true);
	await app.run("player.next()");
	assert.equal(panel.hidden, false);
});

test("minimizar deja el reproductor en una barra y se puede volver a desplegar", () => {
	const app = setup();
	const min = app.elements.get("#player-min");
	min.click();
	assert.equal(min["aria-expanded"], "false");
	min.click();
	assert.equal(min["aria-expanded"], "true");
});

test("la bola reproduce, CURRENTS abre el tracklist y TAME IMPALA pasa de tema", async () => {
	const app = setup();
	const panel = app.elements.get("#tracklist");
	panel.hidden = true;
	await app.run("activate('ball')");
	assert.deepEqual(app.stats.player, ["toggle"]);
	assert.equal(panel.hidden, false); // la bola abre el reproductor cerrado…
	assert.equal(app.elements.get("#player-min")["aria-expanded"], "false"); // …minimizado
	app.run("activate('TitleAlbum')"); // CURRENTS lo abre y lo cierra
	assert.equal(panel.hidden, true);
	app.run("activate('TitleAlbum')");
	assert.equal(panel.hidden, false);
	await app.run("activate('TitleBand')");
	assert.deepEqual(app.stats.player, ["toggle", "next"]);
});

test("P, N y B controlan el reproductor; S ya no hace nada (sin sonido ambiente)", async () => {
	const app = setup();
	const key = app.listeners.get("keydown");
	for (const k of ["s", "p", "n", "b"]) key({ key: k });
	await new Promise((resolve) => setTimeout(resolve));
	assert.deepEqual(app.stats.player, ["toggle", "next", "prev"]);
	assert.equal(app.elements.has("#sound"), false);
});

test("la cámara puede dar la vuelta completa para ver la contraportada", () => {
	const app = setup();
	assert.equal(Number.isFinite(app.run("controls.minAzimuthAngle")), false);
	assert.equal(Number.isFinite(app.run("controls.maxAzimuthAngle")), false);
});

test("los planos conservan el interior y recortan el exterior al inclinar", () => {
	const app = setup();
	app.run("setTarget(1, 1); renderer.frame(16.67)");
	assert.equal(app.run(`clipPlanes.every((plane) => plane.distanceToPoint(new THREE.Vector3().applyMatrix4(cover.matrixWorld)) > 0)`), true);
	assert.equal(app.run(`clipPlanes.some((plane) => plane.distanceToPoint(new THREE.Vector3(1.1, 0, 0).applyMatrix4(cover.matrixWorld)) < 0)`), true);
});

test("mover el ratón no inclina ni balancea la portada: solo se mueve al arrastrar", () => {
	const app = setup();
	assert.equal(app.listeners.has("pointermove"), false);
	for (let i = 0; i < 120; i++) app.run("renderer.frame(16.67)"); // sin tocar nada: antes se balanceaba sola
	assert.equal(app.run("cover.rotation.x"), 0);
	assert.equal(app.run("cover.rotation.y"), 0);
});

test("el permiso de iOS no se duplica ni se vuelve a solicitar tras denegarlo", async () => {
	let requests = 0, finish;
	const app = setup({ requestPermission() {
		requests++;
		return new Promise((resolve) => { finish = resolve; });
	} });
	const click = app.listeners.get("click");
	const pending = click();
	await click();
	assert.equal(requests, 1);
	finish("denied");
	await pending;
	assert.equal(app.listeners.has("click"), false);
	assert.equal(app.listeners.has("deviceorientation"), false);
});

test("el giroscopio inclina la portada y las lecturas inválidas del sensor se ignoran", () => {
	const app = setup();
	app.run("onOrientation({ beta: 10, gamma: 0 })"); // reposo
	app.run("onOrientation({ beta: 10, gamma: 25 })");
	assert.equal(app.run("target.x"), 1);
	app.run("onOrientation({ beta: NaN, gamma: Infinity })");
	assert.equal(app.run("target.x"), 1);
	app.preference.change({ matches: false });
	assert.equal(app.run("reducedMotion"), false);
});

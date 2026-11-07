import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import * as shaders from "../src/shaders.js";

function setup(orientation) {
	const listeners = new Map();
	const stats = { toggles: 0, resets: 0 };
	const elements = new Map();
	const element = () => ({
		setAttribute(name, value) { this[name] = value; },
		addEventListener(name, callback) { this[name] = callback; },
		getContext: () => ({ createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText() {} }),
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
		createAmbient: () => ({ setTilt() {}, playing: false, toggle: async () => ++stats.toggles > 0 }),
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
	key({ key: "s", ctrlKey: true });
	key({ key: "s", target: { tagName: "INPUT" } });
	assert.equal(app.stats.toggles, 0);
	key({ key: "s" });
	assert.equal(app.stats.toggles, 1);
	key({ key: "r" });
	assert.equal(app.stats.resets, 1);
});

test("la tecla T y el botón abren y cierran el tracklist; Escape lo cierra", () => {
	const app = setup();
	const panel = app.elements.get("#tracklist");
	const button = app.elements.get("#tracklist-toggle");
	panel.hidden = true;
	const key = app.listeners.get("keydown");
	key({ key: "t" });
	assert.equal(panel.hidden, false);
	assert.equal(button["aria-expanded"], "true");
	key({ key: "Escape" });
	assert.equal(panel.hidden, true);
	assert.equal(button["aria-expanded"], "false");
	button.click();
	assert.equal(panel.hidden, false);
	key({ key: "t", metaKey: true });
	assert.equal(panel.hidden, false);
});

test("los planos conservan el interior y recortan el exterior al inclinar", () => {
	const app = setup();
	app.run("setTarget(1, 1); renderer.frame(16.67)");
	assert.equal(app.run(`clipPlanes.every((plane) => plane.distanceToPoint(new THREE.Vector3().applyMatrix4(cover.matrixWorld)) > 0)`), true);
	assert.equal(app.run(`clipPlanes.some((plane) => plane.distanceToPoint(new THREE.Vector3(1.1, 0, 0).applyMatrix4(cover.matrixWorld)) < 0)`), true);
});

test("mientras se arrastra la cámara, el puntero no inclina la portada", () => {
	const app = setup();
	app.run("controls.listeners.start()");
	app.listeners.get("pointermove")({ clientX: 1200, clientY: 0 });
	assert.equal(app.run("target.x"), 0);
	app.run("controls.listeners.end()");
	app.listeners.get("pointermove")({ clientX: 1200, clientY: 0 });
	assert.equal(app.run("target.x"), 1);
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

test("el puntero inclina la portada y las lecturas inválidas del sensor se ignoran", () => {
	const app = setup();
	app.listeners.get("pointermove")({ clientX: 1200, clientY: 0 });
	assert.equal(app.run("target.x"), 1);
	assert.equal(app.run("target.y"), -1);
	app.run("onOrientation({ beta: NaN, gamma: Infinity })");
	assert.equal(app.run("target.x"), 1);
	assert.equal(app.run("neutral"), null);
	app.preference.change({ matches: false });
	assert.equal(app.run("reducedMotion"), false);
});

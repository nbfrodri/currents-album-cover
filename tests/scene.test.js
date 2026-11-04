import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import * as shaders from "../src/shaders.js";

function setup(orientation) {
	const listeners = new Map();
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
		load() {}
	}
	const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");
	const context = vm.createContext({
		THREE: { ...THREE, WebGLRenderer: Renderer }, ...shaders,
		GLTFLoader: Loader, DRACOLoader: Loader,
		createAmbient: () => ({ setTilt() {} }),
		window, document, screen: {}, performance, console,
	});
	vm.runInContext(source, context);
	return { run: (code) => vm.runInContext(code, context), listeners, window, preference, elements };
}

test("el fondo queda detrás del hoyo también en modo Profundidad", () => {
	const app = setup();
	app.run("toggleDepth(); for (let i = 0; i < 240; i++) renderer.frame(i * 16.67)");
	assert.ok(app.run("base.position.z < -0.1 * depth"));
});

test("la cámara conserva la portada dentro del plano lejano en ventanas estrechas", () => {
	const app = setup();
	app.window.innerWidth = 80;
	app.window.innerHeight = 1600;
	app.run("resize()");
	assert.ok(app.run("camera.far > camera.position.z + COVER"));
});

test("los atajos no interceptan combinaciones del navegador ni campos de texto", () => {
	const app = setup();
	const key = app.listeners.get("keydown");
	key({ key: "p", ctrlKey: true });
	assert.equal(app.run("depthGoal"), 1);
	key({ key: "p", target: { tagName: "INPUT" } });
	assert.equal(app.run("depthGoal"), 1);
	key({ key: "p", preventDefault() {} });
	assert.equal(app.run("depthGoal"), 2.2);
});

test("los planos conservan el interior y recortan el exterior al inclinar", () => {
	const app = setup();
	app.run("setTarget(1, 1); renderer.frame(16.67)");
	assert.equal(app.run(`clipPlanes.every((plane) => plane.distanceToPoint(new THREE.Vector3().applyMatrix4(cover.matrixWorld)) > 0)`), true);
	assert.equal(app.run(`clipPlanes.some((plane) => plane.distanceToPoint(new THREE.Vector3(1.1, 0, 0).applyMatrix4(cover.matrixWorld)) < 0)`), true);
});

test("el reflejo se reutiliza en reposo y se actualiza al cambiar profundidad o inclinación", () => {
	const app = setup();
	app.run("ball = new THREE.Mesh(); floor.add(ball); let captures = 0; cubeCamera.update = () => { captures++; }; renderer.frame(); renderer.frame();");
	assert.equal(app.run("captures"), 1);
	app.run("toggleDepth(); renderer.frame()");
	assert.equal(app.run("captures"), 2);
	app.run("setTarget(1, 0); renderer.frame()");
	assert.equal(app.run("captures"), 3);
	assert.equal(app.run("cubeCamera.children.every((face) => face.layers.isEnabled(0) && face.layers.isEnabled(1))"), true);
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

test("el puntero inicial funciona y las lecturas inválidas del sensor se ignoran", () => {
	const app = setup();
	app.elements.get("#scene").pointerdown({ clientX: 1200, clientY: 0 });
	assert.equal(app.run("target.x"), 1);
	assert.equal(app.run("target.y"), -1);
	app.run("onOrientation({ beta: NaN, gamma: Infinity })");
	assert.equal(app.run("target.x"), 1);
	assert.equal(app.run("neutral"), null);
	app.preference.change({ matches: false });
	assert.equal(app.run("reducedMotion"), false);
});

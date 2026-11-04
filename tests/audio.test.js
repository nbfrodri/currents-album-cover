import assert from "node:assert/strict";
import test from "node:test";
import { createAmbient } from "../src/audio.js";

function audioMock(t) {
	const nodes = [];
	let context;
	const parameter = () => ({
		value: 0,
		targets: [],
		setTargetAtTime(value) { this.targets.push(value); },
		cancelScheduledValues() { this.value = 0; },
		setValueAtTime(value) { this.held = value; },
		linearRampToValueAtTime() {},
	});
	class Context {
		constructor() { context = this; this.currentTime = 0; this.state = "suspended"; }
		createGain() {
			const node = { gain: parameter(), connect() { return this; } };
			nodes.push(node);
			return node;
		}
		createStereoPanner() { return { pan: parameter(), connect() {} }; }
		createBiquadFilter() { return { frequency: parameter(), Q: parameter(), connect() {} }; }
		createDelay() { return { delayTime: parameter(), connect() { return this; } }; }
		createOscillator() { return { frequency: parameter(), detune: parameter(), connect(node) { return node; }, start() {} }; }
		async resume() { this.state = "running"; }
		async suspend() { this.state = "suspended"; }
		async close() { this.state = "closed"; }
	}
	t.mock.method(globalThis, "setInterval", () => 1);
	t.mock.method(globalThis, "clearInterval", () => {});
	t.mock.method(globalThis, "setTimeout", (callback) => { callback(); return 1; });
	globalThis.AudioContext = Context;
	t.after(() => { delete globalThis.AudioContext; });
	return { Context, nodes, get context() { return context; } };
}

test("el apagado conserva la ganancia anterior a cancelar la rampa", async (t) => {
	const mock = audioMock(t);
	const ambient = createAmbient();
	await ambient.toggle();
	mock.nodes[0].gain.value = 0.2;
	await ambient.toggle();
	assert.equal(mock.nodes[0].gain.held, 0.2);
	assert.equal(ambient.playing, false);
});

test("una inicialización fallida se puede reintentar con un contexto limpio", async (t) => {
	const mock = audioMock(t);
	const create = mock.Context.prototype.createStereoPanner;
	mock.Context.prototype.createStereoPanner = () => { throw new Error("fallo de audio"); };
	const ambient = createAmbient();
	await assert.rejects(ambient.toggle(), /fallo de audio/);
	assert.equal(mock.context.state, "closed");
	mock.Context.prototype.createStereoPanner = create;
	assert.equal(await ambient.toggle(), true);
});

test("una inclinación sin cambios no acumula automatizaciones", async (t) => {
	const mock = audioMock(t);
	let filter;
	const create = mock.Context.prototype.createBiquadFilter;
	mock.Context.prototype.createBiquadFilter = function () { return filter = create.call(this); };
	const ambient = createAmbient();
	await ambient.toggle();
	ambient.setTilt(0.2, 0.1);
	const count = filter.frequency.targets.length;
	ambient.setTilt(0.2, 0.1);
	assert.equal(filter.frequency.targets.length, count);
});

test("un fallo al reanudar no activa el sonido y permite reintentar", async (t) => {
	const mock = audioMock(t);
	const resume = mock.Context.prototype.resume;
	mock.Context.prototype.resume = async () => { throw new Error("permiso de audio"); };
	const ambient = createAmbient();
	await assert.rejects(ambient.toggle(), /permiso de audio/);
	assert.equal(ambient.playing, false);
	mock.Context.prototype.resume = resume;
	assert.equal(await ambient.toggle(), true);
});

test("las pulsaciones rápidas se serializan sin suspender el último arranque", async (t) => {
	const mock = audioMock(t);
	const ambient = createAmbient();
	assert.deepEqual(await Promise.all([ambient.toggle(), ambient.toggle(), ambient.toggle()]), [true, false, true]);
	assert.equal(ambient.playing, true);
	assert.equal(mock.context.state, "running");
});

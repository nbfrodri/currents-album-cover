import assert from "node:assert/strict";
import test from "node:test";
import { ballSwell, createBeat } from "../src/beat.js";

const frame = 1 / 60;

// Bombo a 120 bpm: 0.1 s de graves fuertes cada 0.5 s sobre un fondo más bajo
function kicks(beat, seconds, loud = 0.7, base = 0.35) {
	const out = [];
	for (let f = 0; f < seconds * 60; f++) {
		const t = f * frame;
		out.push({ t, pulse: beat.update(t % 0.5 < 0.1 ? loud : base, frame) });
	}
	return out;
}

test("con un bombo regular la bola late en cada golpe durante todo el tema, no solo al principio", () => {
	const frames = kicks(createBeat(), 6);
	for (let beatStart = 2; beatStart < 6; beatStart += 0.5) { // tras 2 s de calentamiento
		const window = frames.filter(({ t }) => t >= beatStart && t < beatStart + 0.5).map(({ pulse }) => pulse);
		assert.ok(Math.max(...window) > 0.6, `latido en ${beatStart}s`);
		assert.ok(Math.min(...window) < 0.35, `se relaja antes del siguiente golpe en ${beatStart}s`);
	}
});

test("el latido es lento: sube rápido pero tarda en bajar", () => {
	const frames = kicks(createBeat(), 4).filter(({ t }) => t >= 3 && t < 3.5);
	const peak = frames.reduce((a, b) => (b.pulse > a.pulse ? b : a));
	const later = frames.find(({ t }) => t >= peak.t + 0.1);
	assert.ok(later.pulse > peak.pulse * 0.4); // 100 ms después sigue bastante hinchada
	assert.ok(peak.t - 3 > 0.05); // y no llega al máximo de golpe
});

test("graves constantes o silencio no hacen latir la bola", () => {
	const steady = createBeat();
	let pulse = 0;
	for (let f = 0; f < 240; f++) pulse = steady.update(0.5, frame);
	assert.ok(pulse < 0.05);
	const quiet = createBeat();
	for (let f = 0; f < 240; f++) pulse = quiet.update(f % 30 < 6 ? 0.04 : 0.01, frame);
	assert.ok(pulse < 0.1);
});

test("la edad del golpe vuelve a cero en cada bombo y crece entre golpes", () => {
	const beat = createBeat();
	const frames = kicks(beat, 3);
	assert.ok(beat.age < 0.5); // el último bombo fue hace menos de un compás
	const after = createBeat();
	for (let f = 0; f < 120; f++) after.update(0.4, frame);
	assert.ok(after.age > 1); // sin golpes, la edad sigue creciendo
	assert.ok(frames.length > 0);
});

test("al empezar a sonar (al pulsar la bola) el primer golpe no es exagerado", () => {
	const beat = createBeat();
	for (let f = 0; f < 60; f++) beat.update(0, frame); // silencio antes de pulsar
	const first = kicks(beat, 0.5).map(({ pulse }) => pulse);
	assert.ok(Math.max(...first) < 0.4, `primer golpe ${Math.max(...first)}`);
	const later = kicks(beat, 3).filter(({ t }) => t >= 2).map(({ pulse }) => pulse);
	assert.ok(Math.max(...later) > 0.6); // luego late con normalidad
});

test("los golpes normales hinchan la bola igual; los que destacan mucho, bastante menos", () => {
	assert.equal(ballSwell(0), 1);
	assert.ok(Math.abs(ballSwell(0.5) - 1.09) < 1e-9); // como antes (18 % por pulso)
	assert.ok(ballSwell(1) < 1.14); // antes 1.18
	assert.ok(ballSwell(1) > ballSwell(0.6)); // sigue creciendo, sin cortar en seco
});

test("tras recargar, el primer clic no deja la bola inflada: se relaja entre golpes desde el principio", () => {
	const beat = createBeat();
	for (let f = 0; f < 120; f++) beat.update(0, frame); // página recién cargada, sin música
	const frames = kicks(beat, 2.5);
	for (let start = 0.5; start < 2.5; start += 0.5) {
		const window = frames.filter(({ t }) => t >= start && t < start + 0.5).map(({ pulse }) => pulse);
		assert.ok(Math.min(...window) < 0.2, `relajada entre golpes en ${start}s (mín ${Math.min(...window).toFixed(2)})`);
	}
});

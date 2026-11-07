import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer } from "../src/player.js";
import { TRACKS, seconds, formatTime } from "../src/tracks.js";

function fakeAudio() {
	const listeners = {};
	return {
		paused: true, currentTime: 0, duration: NaN, src: "", plays: 0,
		addEventListener(name, fn) { (listeners[name] ??= []).push(fn); },
		emit(name) { for (const fn of listeners[name] ?? []) fn(); },
		play() {
			this.plays++;
			if (this.src.startsWith("audio/")) return Promise.reject(new Error("no soportado"));
			this.paused = false;
			return Promise.resolve();
		},
		pause() { this.paused = true; },
	};
}

function fakeContext(stats) {
	return {
		state: "suspended", destination: {},
		resume() { this.state = "running"; return Promise.resolve(); },
		createMediaElementSource() { stats.sources++; return { connect() {} }; },
		createAnalyser() {
			return {
				fftSize: 0, frequencyBinCount: 64, connect() {},
				getByteFrequencyData(data) { data.fill(255, 0, 8); },
			};
		},
	};
}

function setup() {
	const audio = fakeAudio();
	const stats = { sources: 0 };
	const player = createPlayer(TRACKS, { createAudio: () => audio, createContext: () => fakeContext(stats) });
	return { audio, stats, player };
}

test("intenta el MP3 local y, si no existe, reproduce el preview oficial del mismo tema", async () => {
	const { audio, player } = setup();
	await player.play(2);
	assert.equal(audio.src, "audio/03.mp3");
	audio.emit("error");
	assert.equal(audio.src, TRACKS[2].preview);
	assert.equal(player.state().source, "preview");
	await Promise.resolve();
	assert.equal(player.state().playing, true);
	assert.equal(player.state().index, 2);
});

test("al terminar un tema pasa al siguiente y al final vuelve al primero", async () => {
	const { audio, player } = setup();
	await player.play(12);
	audio.emit("ended");
	assert.equal(player.state().index, 0);
	assert.equal(audio.src, "audio/01.mp3");
});

test("anterior reinicia el tema si ya lleva unos segundos y, si no, va al tema previo", async () => {
	const { audio, player } = setup();
	await player.play(4);
	audio.currentTime = 10;
	await player.prev();
	assert.equal(player.state().index, 4);
	assert.equal(audio.currentTime, 0);
	await player.prev();
	assert.equal(player.state().index, 3);
});

test("buscar limita la posición a la duración del audio", async () => {
	const { audio, player } = setup();
	await player.play(0);
	audio.duration = 30;
	player.seek(99);
	assert.equal(audio.currentTime, 30);
	player.seek(-5);
	assert.equal(audio.currentTime, 0);
});

test("el analizador se conecta una sola vez y da niveles normalizados", async () => {
	const { stats, player } = setup();
	assert.deepEqual(player.levels().bass, 0);
	await player.play(0);
	await player.toggle();
	await player.toggle();
	assert.equal(stats.sources, 1);
	const { bass, high } = player.levels();
	assert.ok(bass > 0.9 && bass <= 1);
	assert.equal(high, 0);
});

test("los datos del disco cuadran: 13 temas, 51:06 en total y formato m:ss", () => {
	assert.equal(TRACKS.length, 13);
	assert.equal(formatTime(TRACKS.reduce((sum, t) => sum + seconds(t.time), 0)), "51:06");
	assert.ok(TRACKS.every((t) => t.preview.startsWith("https://audio-ssl.itunes.apple.com/")));
	assert.equal(formatTime(NaN), "0:00");
});

test("el volumen se limita a 0..1, se aplica al audio aunque se fije antes y se puede silenciar", async () => {
	const { audio, player } = setup();
	player.setVolume(1.7);
	assert.equal(player.state().volume, 1);
	player.setVolume(0.4);
	await player.play(0);
	assert.equal(audio.volume, 0.4);
	player.toggleMute();
	assert.equal(audio.muted, true);
	assert.equal(player.state().muted, true);
	player.setVolume(0.6); // mover el volumen quita el silencio
	assert.equal(audio.muted, false);
	assert.equal(audio.volume, 0.6);
});

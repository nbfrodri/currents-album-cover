import assert from "node:assert/strict";
import test from "node:test";
import { mountPanel } from "../src/panel.js";
import { TRACKS } from "../src/tracks.js";

function fakeDoc() {
	const elements = new Map();
	const element = () => ({
		hidden: false,
		style: { setProperty(name, value) { this[name] = value; } },
		classList: { toggle() {} },
		append() {},
		setAttribute() {},
		addEventListener() {},
		getContext: () => ({}),
	});
	return {
		elements,
		createElement: element,
		querySelector(selector) {
			if (!elements.has(selector)) elements.set(selector, element());
			return elements.get(selector);
		},
	};
}

test("la barra de progreso avanza en cada fotograma mientras suena, sin esperar a timeupdate", () => {
	const doc = fakeDoc();
	let current = 10;
	const player = {
		state: () => ({ index: 0, playing: true, current, duration: 100, volume: 1, muted: false, failed: false }),
		onChange() {}, setVolume() {}, toggle() {}, prev() {}, next() {}, play() {}, seek() {}, toggleMute() {},
	};
	const panel = mountPanel(doc, player, TRACKS, () => {});
	const seek = doc.elements.get("#seek");
	panel.tick();
	assert.equal(seek.style["--progress"], "10%");
	current = 10.25; // un cuarto de segundo después, sin ningún evento del audio
	panel.tick();
	assert.equal(seek.style["--progress"], "10.25%");
	assert.equal(doc.elements.get("#time-current").textContent, "0:10");
	doc.elements.get("#tracklist").hidden = true;
	current = 50;
	panel.tick(); // oculto: no hace trabajo
	assert.equal(seek.style["--progress"], "10.25%");
});

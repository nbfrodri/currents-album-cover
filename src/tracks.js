// Tracklist de Currents (2015). El audio se busca primero en public/audio/NN.mp3 (tu copia,
// fuera de git) y, si no está, se usa el preview oficial de 30 s de Apple (CORS abierto).
export const TRACKS = [
	{ title: "Let It Happen", time: "7:47", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/77/68/1f/77681ffc-56e6-813c-e1bc-d94a9b5893c1/mzaf_570579359857462588.plus.aac.p.m4a" },
	{ title: "Nangs", time: "1:47", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/52/10/4f/52104f29-6ed3-86c5-a637-9b8831b53929/mzaf_9597696046563623581.plus.aac.p.m4a" },
	{ title: "The Moment", time: "4:15", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/6b/d7/5b/6bd75b1c-fd09-1498-ad3f-232feb47b2d1/mzaf_6343127270446960346.plus.aac.p.m4a" },
	{ title: "Yes I’m Changing", time: "4:30", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/6c/2d/85/6c2d8590-7cc3-b805-ef00-590c45c44cbd/mzaf_9551388339365687998.plus.aac.p.m4a" },
	{ title: "Eventually", time: "5:19", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/b5/3d/94/b53d94cc-50ce-f392-3084-d2959d0fa5bd/mzaf_6442612610758366337.plus.aac.p.m4a" },
	{ title: "Gossip", time: "0:55", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/3b/05/9c/3b059c0b-e65a-f8e5-a7c2-dff8a4f9a498/mzaf_1814041890887427526.plus.aac.p.m4a" },
	{ title: "The Less I Know the Better", time: "3:36", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/5d/2a/2a/5d2a2a7c-a42f-901e-bbf7-d99c33323526/mzaf_5177778173802721769.plus.aac.p.m4a" },
	{ title: "Past Life", time: "3:48", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/bf/06/ae/bf06ae7e-0e8a-d2c9-fd39-901062ed162d/mzaf_12716791539761852517.plus.aac.p.m4a" },
	{ title: "Disciples", time: "1:48", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f4/92/dd/f492dde0-2d9e-f7d1-7aed-b08b102dd74a/mzaf_8347831547755511862.plus.aac.p.m4a" },
	{ title: "’Cause I’m a Man", time: "4:01", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/43/b5/a8/43b5a8cb-4a87-23c3-a2ad-e7a0cfd52fbe/mzaf_6556857980573530209.plus.aac.p.m4a" },
	{ title: "Reality in Motion", time: "4:12", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/77/64/9e/77649e2b-387b-3040-9828-08e8b8f9242b/mzaf_2461232544264878946.plus.aac.p.m4a" },
	{ title: "Love/Paranoia", time: "3:05", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/f3/7a/45/f37a45da-7706-4348-c050-5b88a20c5553/mzaf_12488790436967025253.plus.aac.p.m4a" },
	{ title: "New Person, Same Old Mistakes", time: "6:03", preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/55/9b/44/559b443e-06b6-bc62-f3f7-5f21a37971b0/mzaf_16483469776306833254.plus.aac.p.m4a" },
];

export const localSource = (index) => `audio/${String(index + 1).padStart(2, "0")}.mp3`;

export const seconds = (time) => {
	const [m, s] = time.split(":").map(Number);
	return m * 60 + s;
};

export const formatTime = (value) => {
	const total = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

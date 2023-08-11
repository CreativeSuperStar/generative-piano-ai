class PianoKey {
	/*
	Properties
		`keyNum`: 1-indexed absolute number of key on the keyboard, starting from lowest note = 1
		`octave`: the octave that this key belongs in, with the first 3 keys being in octave 0
		`octaveKeyNum`: the key's relative key number (1-indexed) in its octave, e.g. C = 1
		`isWhiteKey`: Boolean for whether the key is white or black
		`colourKeyNum`: 0-indexed key number relative to its colour, e.g. first white key = 0
	*/
	constructor(keyNum, octave, octaveKeyNum, isWhiteKey) {
		this.keyNum = keyNum;
		this.octave = octave;
		this.octaveKeyNum = octaveKeyNum;
		this.isWhiteKey = isWhiteKey;
		this.colourKeyNum = this.calcColourKeyNum();
	}
	
	calcColourKeyNum() {
		if (this.isWhiteKey) {
			return Piano.whiteKeyNumbers.indexOf(this.octaveKeyNum) + this.octave*7 - 5;
		} else {
			return Piano.blackKeyNumbers.indexOf(this.octaveKeyNum) + this.octave*5 - 4;
		}
	}
}

class Piano {
	constructor(canvasId, octaves, model) {
		if (octaves < 1 || octaves > 7) {
			throw new RangeError("The number of octaves must be between 1 and 7");
		}
		this.octaves = octaves;
		this.whiteKeys = 7 * this.octaves + 3; // 3 additional keys before and after main octaves
		this.blackKeys = 5 * this.octaves + 1; // 1 additional key in the 0th octave
		this.notes = this.getNotes();
		
		this.model = model;
		this.sampler = this.initialiseSampler();
		this.toneStarted = false;
		this.noteHistory = [];
		
		this.canvas = document.getElementById(canvasId);
		this.drawKeyboard();
		this.canvas.addEventListener('mousedown', this.keyboardClicked.bind(this));
		this.canvas.addEventListener('mousemove', this.mouseMoveKeyboard.bind(this));
		this.canvas.addEventListener('mouseout', this.mouseOutKeyboard.bind(this));
		
		this.prevHoverKey = null;
		
	}
	
	static get keyboardRatio() {
		return 1/8;
	}
	
	static get blackKeyWidthRatio() {
		return 1/2;
	}
	
	static get blackKeyHeightRatio() {
		return 2/3;
	}
	
	static get keyFill() {
		return {
			'white': {'inactive': '#FEFEFE', 'active': '#FEF3B0'},
			'black': {'inactive': '#595959', 'active': '#C09200'}
		};
	}
	
	// Key number of the white keys relative to an octave
	static get whiteKeyNumbers() {
		return [1, 3, 5, 6, 8, 10, 12];
	}
	
	// Key number of the black keys relative to an octave
	static get blackKeyNumbers() {
		return [2, 4, 7, 9, 11];
	}
	
	// Top left coordinate of each black key relative to start of an octave (normalised by whiteKeyWidth)
	static get blackKeyPos() {
		return [
			2/3,
			1 + 5/6,
			3 + 5/8,
			4 + 3/4,
			5 + 7/8
		];
	}
	
	getKeyByCoord(clientX, clientY) {
		const canvasRect = this.canvas.getBoundingClientRect();
		const x = clientX - canvasRect.left;
		const y = clientY - canvasRect.top;
		
		const octaveWidth = this.whiteKeyWidth * 7;
		const o = Math.floor((x + (this.whiteKeyWidth * 5)) / octaveWidth); // Current octave
		const deltaX = x - ((o-1) * octaveWidth) - (2 * this.whiteKeyWidth); // x position relative to octave
		
		if (y > this.blackKeyHeight) {
			// Must be a white key
			const n = Math.floor(deltaX / this.whiteKeyWidth);
			const octaveKeyNum = Piano.whiteKeyNumbers[n];
			const keyNum = octaveKeyNum + o*12 - 9;
			return new PianoKey(keyNum, o, octaveKeyNum, true);
		} else if (o === this.octaves + 1) {
			// Only highest C is in the highest octave
			return new PianoKey(o * 12 - 8, o, 1, true);
		} else {
			for (let i=0; i < Piano.blackKeyPos.length; i++) {
				if (o === 0 && i < 4) {
					// 0th octave does not have first 4 black keys
					continue;
				}
				const pos = Piano.blackKeyPos[i];
				const blackKeyLeft = this.whiteKeyWidth * pos;
				const blackKeyRight = blackKeyLeft + this.blackKeyWidth;
				// Except for octave 0, which only has 1 black key
				if (deltaX >= blackKeyLeft && deltaX <= blackKeyRight) {
					const octaveKeyNum = Piano.blackKeyNumbers[i];
					const keyNum = octaveKeyNum + o*12 - 9;
					return new PianoKey(keyNum, o, octaveKeyNum, false);
				}
			}
			// Not a black key, therefore must be a white key
			const n = Math.floor(deltaX / this.whiteKeyWidth);
			const octaveKeyNum = Piano.whiteKeyNumbers[n];
			const keyNum = octaveKeyNum + o*12 - 9;
			return new PianoKey(keyNum, o, octaveKeyNum, true);
		}
	}
	
	getXCoordByKey(isWhiteKey, colourKeyNum) {
		if (isWhiteKey) {
			return this.whiteKeyWidth * colourKeyNum;
		} else {
			const k = (colourKeyNum + 4) % 5; // Index of the 5 black keys in `blackKeyPos`
			const o = Math.floor((colourKeyNum-1) / 5); // Current octave (first full octave is index 0, unlike PianoKey convention)
			return this.whiteKeyWidth * (Piano.blackKeyPos[k] + o*7 + 2);
		}
	}
	
	getNotes() {
		const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
		const octaveNums = [...Array(this.octaves).keys()].map((x) => x + 4 - Math.floor(this.octaves / 2));
		const allNotes = noteNames.slice(-3).map((n) => n + (octaveNums.at(0) - 1));
		allNotes.push(...octaveNums.map((o) => noteNames.map((n) => n + o)).flat());
		allNotes.push(noteNames.at(0) + (octaveNums.at(-1) + 1));
		return allNotes;
	}
	
	startTone() {
		Tone.start().then(() => {
			Tone.Transport.start();
		});
		this.toneStarted = true;
		setInterval(() => this.callModel(), 2000);
	}
	
	playNote(noteKey, time) {
		const currTransportPosition = Tone.Transport.position;
		const currTime = new Date();
		
		this.sampler.triggerAttackRelease(this.notes[noteKey.keyNum-1], 0.2, time);
		this.noteHistory.push({note: noteKey, position: currTransportPosition});
		
		// Draw note on canvas
		if (typeof this.notesCanvas !== 'undefined') {
			if (typeof time !== 'undefined') {
				// Note was triggered using Transport, so schedule drawing using Tone.Draw callback
				Tone.Draw.schedule(() => this.notesCanvas.addNote(noteKey, currTime), time);
			} else {
				this.notesCanvas.addNote(noteKey, currTime);
			}
		}
		return currTransportPosition;
	}
	
	scheduleNote(noteKey, triggerTime) {
		Tone.Transport.scheduleOnce((time) => this.playNote(noteKey, time), triggerTime);
	}
	
	callModel() {
		const start = typeof this.prevCallEnd === 'undefined' ? 0 : this.prevCallEnd;
		const end = Tone.Transport.position;
		const recentHistory = this.getRecentHistory(this.noteHistory, start);
		const generated = this.model.generateNotes(recentHistory, start, end, Tone.Time("1m"));
		for (const g of generated) {
			//this.scheduleNote(g.note, g.position);
		}
		
		this.prevCallEnd = end;
	}
	
	getRecentHistory(history, start) {
		const recentHistory = [];
		for (let i = history.length - 1; i >= 0; i--) {
			const h = history[i];
			if (Tone.Time(h.position).toTicks() >= Tone.Time(start).toTicks()) {
				recentHistory.push(h);
			} else {
				break;
			}
		}
		return recentHistory;
	}
	
	keyboardClicked(event) {
		if (!this.toneStarted) { this.startTone(); }
		
		globalMouseDown = true;
		const clickedKey = this.getKeyByCoord(event.clientX, event.clientY);
		const transportPosition = this.playNote(clickedKey);
		
		//const triggerTime = (Tone.Time(transportPosition).toTicks() + Tone.Time("1m").toTicks()) + "i";
		//this.scheduleNote(clickedKey, triggerTime);
	}
	
	mouseMoveKeyboard(event) {
		const hoverKey = this.getKeyByCoord(event.clientX, event.clientY);
		if (this.prevHoverKey === null || this.prevHoverKey.keyNum !== hoverKey.keyNum) {
			// Newly moused over key
			this.drawKeyboard(hoverKey);
			if (globalMouseDown) {
				this.playNote(hoverKey);
			}
			this.prevHoverKey = hoverKey;
		}
	}
	
	mouseOutKeyboard(event) {
		this.drawKeyboard();
		this.prevHoverKey = null;
	}
	
	drawKeyboard(hoverKey) {
		const hoverKeyDefined = (typeof hoverKey !== 'undefined');
		
		const ctx = this.canvas.getContext('2d');
		this.canvas.width = window.innerWidth;
		this.canvas.height = this.canvas.width * Piano.keyboardRatio;
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		this.whiteKeyWidth = this.canvas.width / this.whiteKeys;
		this.whiteKeyHeight = this.canvas.height;
		this.blackKeyWidth = this.whiteKeyWidth * Piano.blackKeyWidthRatio;
		this.blackKeyHeight = this.whiteKeyHeight * Piano.blackKeyHeightRatio;
		const [whiteKeyWidth, whiteKeyHeight, blackKeyWidth, blackKeyHeight] = [this.whiteKeyWidth, this.whiteKeyHeight, this.blackKeyWidth, this.blackKeyHeight];
		
		for (let i = 0; i < this.whiteKeys; i++) {
			ctx.fillStyle = Piano.keyFill.white.inactive;
			if (hoverKeyDefined && hoverKey.isWhiteKey && hoverKey.colourKeyNum === i) {
				ctx.fillStyle = Piano.keyFill.white.active;
			}
			const x = this.getXCoordByKey(true, i);
			ctx.fillRect(x, 0, whiteKeyWidth, whiteKeyHeight);
			ctx.strokeRect(x, 0, whiteKeyWidth, whiteKeyHeight);
		}

		for (let i = 0; i < this.blackKeys; i++) {
			ctx.fillStyle = Piano.keyFill.black.inactive;
			if (hoverKeyDefined && !hoverKey.isWhiteKey && hoverKey.colourKeyNum === i) {
				ctx.fillStyle = Piano.keyFill.black.active;
			}
			const x = this.getXCoordByKey(false, i);
			ctx.fillRect(x, 0, blackKeyWidth, blackKeyHeight);
			ctx.strokeRect(x, 0, blackKeyWidth, blackKeyHeight);
		}
	}
	
	initialiseSampler() {
		const sampleFiles = Object.assign({}, ...this.notes.map((n) => ({[n]: n.replace('#', 's') + ".mp3"})));
		// No sample files for keys A0, A#0, and B0
		delete sampleFiles['A0'];
		delete sampleFiles['A#0']
		delete sampleFiles['B0']
		
		const sampler = new Tone.Sampler({
			urls: sampleFiles,
			baseUrl: "assets/samples/piano/",
			release: 0.5
		}).toDestination();
		
		return sampler;
	}
	
	bindNotesCanvas(notesCanvas) {
		this.notesCanvas = notesCanvas;
	}
}
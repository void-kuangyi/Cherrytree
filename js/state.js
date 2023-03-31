"use strict";
define('state', ['jquery','utils', 'passages', 'datatypes/customcommand', 'utils/operationutils', 'markup'],
($, Utils, Passages, CustomCommand, {toSource,is}, {lex}) => {
	/*
		State
		Singleton controlling the running game state.
	*/
	const {assign, create, defineProperty} = Object;
	const {isArray} = Array;
	const {imul} = Math;
	/*
		This ensures that serialisation of Maps and Sets works as expected.
	*/
	defineProperty(Map.prototype, 'toJSON', { value: undefined });
	defineProperty(Set.prototype, 'toJSON', { value: undefined });

	/*
		A browser compatibility check for localStorage and sessionStorage.
	*/
	const hasStorage = ["localStorage","sessionStorage"].map(name => {
		/*
			This is, to my knowledge, the only surefire way of measuring localStorage's
			availability.
			* On some browsers, window.localStorage will throw when run in an <iframe sandbox>
			* On some browsers, setItem() will throw in Private Browsing mode.
		*/
		try {
			return !!window[name]
				&& (() => {
					window[name].setItem("test", '1');
					window[name].removeItem("test");
					return true;
				})();
		} catch (e) {
			return false;
		}
	});
	
	/*
		The global variable scope. This is progressively mutated as the game progresses,
		and deltas of these changes (on a per-turn basis) are stored in Moments in the Timeline array.

	*/
	let CurrentVariables;

	/*
		PRNG settings.
	*/
	/*
		mulberry32 by Tommy Ettinger, seeded with MurmurHash3 by Austin Appleby.
		This is seeded with a single character to save space in save files (where this is saved
		alongside the seedIter).
	*/
	function mulberryMurmur32(s = String.fromCodePoint(Date.now()%0x110000), iter=0) {
		CurrentVariables.seedIter = iter;
		CurrentVariables.seed = s;
		let k, i = 0, h = 2166136261;
		for(; i < s.length; i+=1) {
			k = imul(s.charCodeAt(i), 3432918353);
			k = k << 15 | k >>> 17;
			h ^= imul(k, 461845907);
			h = h << 13 | h >>> 19;
			h = imul(h, 5) + 3864292196 | 0;
		}
		h ^= s.length;
		h ^= h >>> 16; h = imul(h, 2246822507);
		h ^= h >>> 13; h = imul(h, 3266489909);
		h ^= h >>> 16;
		h = (h >>> 0) + 0x6D2B79F5 * iter;
		return () => {
			/*
				So that the seedIter can be properly serialised, each mulberry32 iteration
				increases it even though it's not used in the calculation. (The actual
				PRNG state is stored in h.)
			*/
			CurrentVariables.seedIter += 1;
			let t = (h += 0x6D2B79F5);
			t = imul(t ^ t >>> 15, t | 1);
			t ^= t + imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}
	let PRNG;

	/*
		When given two arrays or maps, this attempts to construct a {via} valueRef
		for the new value - a string of Harlowe source with "it" keywords referring to the old value
		used judiciously to save space.
	*/
	function modifierValueRef(oldVal, newVal, path) {
		const pathPossessive = (path === "it") ? "its" : path + "'s";
		let ret = '';
		if (isArray(newVal) && isArray(oldVal) && newVal.length) {
			/*
				This boolean checks, while the array is being serialised, whether the
				two arrays are equal. If so, then just the path to this array is returned (below).
			*/
			let equal = newVal.length === oldVal.length;
			ret = `(a:`;
			for(let i = 0; i < newVal.length; i += 1) {
				const v = newVal[i];
				/*
					Identical values are serialiased as either their source, or an "its" index,
					whichever is shorter.
				*/
				if (is(v, oldVal[i])) {
					const source = toSource(v);
					const pathIndex = `${pathPossessive} ${i+1}th`;
					ret += (source.length < pathIndex.length ? source : pathIndex) + ',';
					continue;
				}
				equal = false;
				const ind = oldVal.indexOf(v);
				/*
					If this value can be found elsewhere in oldVal (potentially suggesting a deletion
					earlier in this array) then try to serialise as an index to that.
				*/
				if (ind > -1) {
					const source = toSource(v);
					const pathIndex = `${pathPossessive} ${ind+1}th`;
					ret += (source.length < pathIndex.length ? source : pathIndex) + ',';
					continue;
				}
				ret += modifierValueRef(oldVal[i], v, `${pathPossessive} ${i+1}th`) + ',';
			}
			
			if (equal) {
				ret = path;
			}
			/*
				This completes the call while also trimming the final ','.
			*/
			else {
				ret = ret.slice(0,-1) + ")";
			}
		}
		else if (newVal instanceof Map && oldVal instanceof Map && newVal.size) {
			let equal = newVal.size === oldVal.size;
			ret = `(dm:`;
			for(let [k,v] of newVal.entries()) {
				ret += `${toSource(k)},`;
				/*
					Identical values are serialiased as either their source, or an "its" index,
					whichever is shorter.
				*/
				if (is(v, oldVal.get(k))) {
					const source = toSource(v);
					const pathIndex = `${pathPossessive} (${toSource(k)})`;
					ret += (source.length < pathIndex.length ? source : pathIndex) + ',';
					continue;
				}
				equal = false;
				ret += modifierValueRef(oldVal.get(k),v, `${pathPossessive} (${toSource(k)})`) + ',';
			}
			if (equal) {
				ret = path;
			}
			/*
				This completes the call while also trimming the final ','.
			*/
			else {
				ret = ret.slice(0,-1) + ")";
			}
		}
		else if (newVal instanceof Set && oldVal instanceof Set && newVal.size) {
			/*
				We should do something a little different here… obtain the
				differences between each dataset, and then add or subtract them.
			*/
			const onlyInOld = new Set(), onlyInNew = new Set();
			for (let v of oldVal) {
				if (!newVal.has(v)) {
					onlyInOld.add(v);
				}
			}
			for (let v of newVal) {
				if (!oldVal.has(v)) {
					onlyInNew.add(v);
				}
			}
			if (!onlyInOld.size && !onlyInNew.size) {
				ret = path;
			}
			/*
				TODO: a better check than this to see if the valueRef is longer than the string representation?
			*/
			if (onlyInOld.size + onlyInNew.size > newVal.size) {
				ret = toSource(newVal);
			}
			else {
				ret = path + (onlyInNew.size ? "+" + toSource(onlyInNew) : '') + (onlyInOld.size ? "-" + toSource(onlyInOld) : '');
			}
		}
		/*
			Strings are optimised only if they are appended or prepended versions of the previous string.
		*/
		else if (typeof newVal === "string" && typeof oldVal === "string" && newVal) {
			if (newVal.startsWith(oldVal)) {
				ret = path + "+" + toSource(newVal.slice(oldVal.length));
			} else if (newVal.endsWith(oldVal)) {
				ret = toSource(newVal.slice(0,newVal.length - oldVal.length)) + "+" + path;
			}
		}
		if (!ret) {
			/*
				If there was no serialiased string constructed above, and the path is "it", then this
				failed to create a meaningful valueRef. Simply return undefined.
			*/
			return (path === "it") ? undefined :
				/*
					Alternatively, recursive calls on array values will result in non-Map non-Array values being passed in.
					These should just be serialised to their source.
				*/
				toSource(newVal);
		}
		/*
			Because this is both plainly called by TwineScript_Set() as well as recursively called,
			the bottommost call should return something different (a {via} object usable by serialiseFn())
			rather than a string of source.
		*/
		return (path === "it") ? {via:ret} : ret;
	}

	/*
		Prototype object for states remembered by the game.
	*/
	const Moment = {
		/*
			Current passage name and variables store.
		*/
		passage: "",
		variables: create(null),
		/*
			This array of strings is only used for (redirect:)s, and represents each passage redirected to during the previous moment.
			These are added to (history:).
			When (forget-undos:) is used, it also holds erased visits.
		*/
		visits: undefined,
		/*
			A number of additional turns which were erased by (forget-undos:).
		*/
		turns: undefined,
		/*
			(seed:) and (mock-visits:) calls produce these stateful changes, which are also recorded.
		*/
		seed: undefined,
		seedIter: undefined,
		/*
			For testing purposes, there needs to be a way to "mock" having visited certain passages a certain number of times.
			Because (mock-visits:) and (mock-turns:) calls should be considered modal, and can be undone, their effects need to be tied
			to the variable store.
		*/
		mockVisits: undefined,
		mockTurns: undefined,
		/*
			When (forget-visits:) is used, the preceding turns' (before the forgetVisits number) visits are to be ignored from now on.
		*/
		forgetVisits: undefined,

		/*
			Make a new Moment that comes temporally after this.
			This is usually a fresh Moment, but the State deserialiser
			must re-create prior sessions' Moments.
			Thus, pre-set variables may be supplied to this method.
			
			@param {String} The name of the passage that the player is at in this moment.
			@param {Object} Variables to include in this moment.
		*/
		create(p) {
			const ret = create(Moment);
			ret.passage = p || "";
			// Variables are stored as deltas of the previous state's variables.
			ret.variables = create(null);

			/*
				Value Refs (used to reconstruct long values from save files) are tracked as well.
				This doesn't matter to the System Variables or the epoch, so it isn't included.
			*/
			ret.valueRefs = create(null);
			return ret;
		}
	};
	
	/*
		Debug Mode event handlers are stored here by on(). "forward" and "back" handlers are called
		when the present changes, and thus when play(), fastForward() and rewind() have been called.
		"load" handlers are called exclusively in deserialise(). "redirect" and "forgetUndos" are
		called for their respective methods.
	*/
	const eventHandlers = {
		forward: [],
		back: [],
		load: [],

		beforeForward: [],
		beforeBack: [],
		beforeLoad: [],

		forgetUndos: [],
	};

	/*
		Stack of previous states.
		This includes both the past (moments the player has created) as well as the future (moments
		the player has undone).
		Count begins at 0 (the game start).
	*/
	let timeline = [];
	
	/*
		Index to the game state just when the current passage was entered.
		This represents where the player is within the timeline.
		Everything beyond this index is the future. Everything before and including is the past.
		It usually equals timeline.length-1, except when the player undos.
	*/
	let recent = -1;
	
	/*
		The present - the resultant game state after the current passage executed.
		This is a 'potential moment' - a moment that could become the newest to enter the timeline.
		This is pushed onto the timeline (becoming "recent") when going forward,
		and discarded when going backward.
		Its passage name should equal that of recent.
	*/
	let present = Moment.create();

	/*
		A cache of the serialised JSON form of the past moments. Invalidated (made falsy) whenever pastward temporal movement
		occurs. Why isn't the present included? Because the present is liable to change as (set:) macros are run. Remember that
		each past moment reflects the game state as the passage was *left*, not entered.
	*/
	let serialisedPast = '';

	/*
		This is used to flatten a timeline into a single moment, which is either the present (for reconstructCurrentVariables),
		or a past moment (for forgetUndos).

		Assumption: this always flattens onto a single moment at the "end" of the array of moments.
	*/
	const flattenMomentVariables = (array, dest) => {
		const varDest = dest.variables;
		/*
			Variable deletions (which are currently not possible as of Harlowe 3.3.0) are recorded here,
			preventing earlier moments' variables from overwriting these names.
		*/
		const deletions = create(null);
		/*
			This iterates backwards through the timeline, adding missing variables to the flat dest moment.
		*/
		for (let i = array.length - 1; i >= 0; i -= 1) {
			const moment = array[i];
			/*
				mockVisits, mockTurns, seedIter and seed overshadow previous turns' values.
			*/
			for (let name of ["mockVisits","mockTurns","seed","seedIter"]) {
				hasOwnProperty.call(moment,name) && !hasOwnProperty.call(dest,name) && (dest[name] = moment[name]);
			}
			moment.forgetVisits && (dest.forgetVisits = Math.max(dest.forgetVisits || 0, moment.forgetVisits));
			/*
				These, however, are cumulative across turns.
			*/
			moment.turns !== undefined      && (dest.turns = (dest.turns || 0) + moment.turns);
			dest.pastVisits || (dest.pastVisits = []);

			/*
				"visits" only refers to past visits, such as those given to (history:),
				so the final moment's passage name shouldn't be included.
			*/
			if (i !== array.length-1) {
				/*
					If the next moment had visits, then that means this moment has redirects.
					So, bundle this passage name in with the redirects in the array on the front of pastVisits.
				*/
				if (array[i+1].visits !== undefined && Array.isArray(dest.pastVisits[0])) {
					dest.pastVisits[0].unshift(moment.passage);
				}
				else {
					dest.pastVisits.unshift(moment.passage);
				}
			}
			/*
				If a moment has a pastVisits array, then it represents various turns erased with (forget-undos:).
				These go before its own visits (redirects).
			*/
			moment.pastVisits !== undefined && (dest.pastVisits.unshift(moment.pastVisits));
			moment.visits !== undefined && (dest.pastVisits.unshift(moment.visits));

			for (let prop in moment.variables) {
				/*
					The TwineScript_TypeDefs object (of inaccessible/non-writable data structures) doesn't need to have its contents cloned.
				*/
				if (prop === "TwineScript_TypeDefs") {
					varDest[prop] || (varDest[prop] = create(null));
					for (let varName in moment.variables[prop]) {
						varDest[prop][varName] || (varDest[prop][varName] = moment.variables[prop][varName]);
					}
				}
				else if (!prop.startsWith("TwineScript_") && !(prop in varDest)) {
					/*
						The JSON value "null" represents variables deleted by (move:).
					*/
					if (moment.variables[prop] === null) {
						deletions[prop] = true;
					}
					if (!deletions[prop]) {
						varDest[prop] = moment.variables[prop];
						/*
							If this variable had a valueRef at this turn, and the valueRef is NOT
							a "via" valueRef (which uses 'it' to reference past turns), then save the valueRef as well.
						*/
						const ref = moment.valueRefs[prop];
						if (ref && !('via' in ref)) {
							dest.valueRefs[prop] || (dest.valueRefs[prop] = ref);
						}
					}
				}
			}
		}
		/*
			Having flattened it down, the final moment shouldn't have any valueRefs remaining.
			This code removes any that remain.
		*/
		for (let prop in dest.valueRefs) {
			const ref = dest.valueRefs[prop];
			if (ref && ('via' in ref)) {
				delete dest.valueRefs[prop];
			}
		}
	};


	/*
		The history cache, essentially a flattened version of pastVisits, is used for speeding up (history:) lookups, which are commonly used in storylets and other places.
	*/
	function reconstructCurrentHistory() {
		/*
			(mock-visits:) always adds its strings to the start.
		*/
		CurrentVariables.history = CurrentVariables.pastVisits.slice(CurrentVariables.forgetVisits).reduce((a,e)=>a.concat(e), []);
		if (CurrentVariables.mockVisits) {
			CurrentVariables.history = CurrentVariables.mockVisits.concat(CurrentVariables.history);
		}
	}
	/*
		Whenever a turn is undone or the game state is reloaded entirely, the CurrentVariables must be rebuilt.
	*/
	function reconstructCurrentVariables() {
		const ret = Moment.create();
		/*
			The CurrentVariables has a pastVisits array, which is the full record of passage visits.
			Each element is a turn, which can be a single string or an array of redirects.
		*/
		ret.pastVisits = [];
		/*
			The CurrentVariables object's variables store needs the appropriate methods and flagging properties.
			TODO: Move all methods (EXCEPT TwineScript_Set() and TwineScript_Delete(), which are called by VarRef) off this and onto State itself.
		*/
		assign(ret.variables, {
			/*
				Note that it's not possible for userland TwineScript to directly access or
				modify this base object.
			*/
			TwineScript_ObjectName: "this story's variables",
	
			/*
				This is the root prototype of every frame's variable type definitions. Inside a TypeDefs
				is every variable name that this variables collection contains, mapped to a Harlowe datatype.
			*/
			TwineScript_TypeDefs: create(null),
	
			/*
				This is used to distinguish to (set:) that this is a variable store,
				and assigning to its properties does affect game state.
			*/
			TwineScript_VariableStore: { type: 'global', name: "this story's variables" },
	
			/*
				All read/update/delete operations on this scope also update the delta for the current moment (present).
			*/
			TwineScript_Delete(prop) {
				delete this[prop];
				/*
					Setting this Moment's variable to 'null' marks it as deleted, for serialisation.
					Note that the SystemVariables store has this as 'undefined' (via the previous
					statement) so this (probably) isn't visible outside of State.
				*/
				present.variables[prop] = null;
				delete present.valueRefs[prop];
			},
	
			TwineScript_Set(prop, value, valueRef) {
				this[prop] = value;
				/*
					It's not necessary to clone (pass-by-value) the value when placing it on the delta,
					because once placed in the variable store, it should be impossible to mutate
					the value anymore - only by replacing it with another TwineScript_Set().
				*/
				present.variables[prop] = value;
				/*
					The value reference (used for save file reconstruction) is also recorded.
				*/
				if (valueRef) {
					present.valueRefs[prop] = valueRef;
				}
				/*
					Second attempt at producing a valueRef:
					When a data structure has been permuted, attempt to construct a smaller serialisation of that
					change, based on the previous known value for the variable.
				*/
				else if ((isArray(value) || value instanceof Map || value instanceof Set || typeof value === "string") &&
						/*
							3.3.5: Special valueRef bug triage switch (to be removed in a future version).
						*/
						!Utils.options.uncompressedStructures) {
					for(let i = recent; i >= 0; i -= 1) {
						const v = timeline[i].variables[prop];
						if (v !== undefined) {
							const viaValueRef = modifierValueRef(v, value, 'it');
							/*
								If it was serialised as just {via:"it"}, then we've discovered that
								the new value is identical to the previous value. If that's the case, simply
								delete this variable from the present moment instead of creating a valueRef
								for it.
							*/
							if (viaValueRef) {
								if (viaValueRef.via === "it") {
									delete present.variables[prop];
								} else {
									present.valueRefs[prop] = viaValueRef;
								}
							}
							break;
						}
					}
				}
			},
	
			TwineScript_GetProperty(prop) {
				return this[prop];
			},
	
			TwineScript_DefineType(prop, type) {
				this.TwineScript_TypeDefs[prop] = type;
				/*
					VarRef.defineType() automatically installs TwineScript_TypeDefs on destination objects,
					but we need to also install it on the present moment.
				*/
				if (!hasOwnProperty.call(present.variables,"TwineScript_TypeDefs")) {
					present.variables.TwineScript_TypeDefs = create(null);
				}
				present.variables.TwineScript_TypeDefs[prop] = type;
			},
		});

		/*
			Flatten every moment into the new CurrentVariables object.
		*/
		flattenMomentVariables(timeline.slice(0, recent + 1), ret);
		/*
			Now we're done, except for recalibrating the PRNG and updating the history cache.
		*/
		CurrentVariables = ret;
		reconstructCurrentHistory();
		/*
			If we're undoing to the start, restore the initial seed state.
		*/
		PRNG = mulberryMurmur32(ret.seed, ret.seedIter);
	}

	reconstructCurrentVariables();
	present.seed = CurrentVariables.seed;
	present.seedIter = 0;

	let State;
	/*
		This enables session storage to preserve the game state across reloads, even when the browser
		(such as that of a phone) doesn't naturally preserve it using something like FF's bfcache.
	*/
	function saveSession(serialisation) {
		if (State.hasSessionStorage) {
			/*
				Since we're in the middle of navigating to another Moment, just silently disregard errors.
			*/
			if (typeof serialisation === "string") {
				try {
					sessionStorage.setItem("Saved Session", serialisation);
				} catch(e) {
					// Again, silently disregard errors.
					return;
				}
			}
		}
	}

	/*
		A private method to create a new present after altering the state.
		@param {String} The name of the passage the player is now currently at.
	*/
	function newPresent(newPassageName) {
		present = Moment.create(newPassageName);

		/*
			Update the serialisedPast cache, so that the moment that used to be
			the present is included in it. This is how serialisedPast is incrementally
			increased as the game progresses.
		*/
		let pastAndPresent;
		({past:serialisedPast, pastAndPresent} = State.serialise(true));

		saveSession(pastAndPresent);
	}

	/*
		The current game's state.
	*/
	State = {
		/*
			Getters/setters
		*/

		/*
			Get the current passage name.
			Used as a common argument to Engine.showPassage()
		*/
		get passage() {
			return present.passage;
		},
		
		/*
			Get the current variables.
		*/
		get variables() {
			return CurrentVariables.variables;
		},

		/*
			Is there an undo cache?
		*/
		get pastLength() {
			return recent;
		},

		/*
			Used by the "turns" identifier.
		*/
		get turns() {
			return recent + 1 + (CurrentVariables.turns || 0) + (CurrentVariables.mockTurns || 0);
		},

		/*
			Is there a redo cache?
		*/
		get futureLength() {
			return (timeline.length - 1) - recent;
		},

		/*
			Get and set the current mockVisits and mockTurns state.
			These replace all previous instantiations.
		*/
		get mockVisits() {
			return CurrentVariables.mockVisits || [];
		},

		set mockVisits(value) {
			CurrentVariables.mockVisits = value;
			present.mockVisits = value;
			reconstructCurrentHistory();
		},

		get mockTurns() {
			return CurrentVariables.mockTurns || 0;
		},

		set mockTurns(value) {
			CurrentVariables.mockTurns = value;
			present.mockTurns = value;
		},

		/*
			Used by (history:). Because storylets are liable to call (history:) a lot,
			it's ideal to do as little work as necessary in this.
		*/
		history() {
			return CurrentVariables.history;
		},

		/*
			Used by (forget-undos:). All moments before the specified index are flattened into the new first moment.
			This cannot erase timeline[recent];

			Note that this should simply never be called when used in a past moment (not the one at the end of the timeline)
			so we can assume that recent is always timeline.length-1.
		*/
		forgetUndos(ind) {
			if (ind < 0) {
				ind = (timeline.length) + ind;
			}
			const excised = timeline.splice(0, Math.min(timeline.length - 1, ind));
			if (!excised.length) {
				return;
			}
			/*
				We can freely change recent to be the *new* end of the timeline, because of the aforementioned
				prohibition of using this in past moments.
			*/
			recent = timeline.length - 1;
			/*
				Flatten the excised moments onto the new first moment.
			*/
			const first = timeline[0];
			flattenMomentVariables(excised, first);
			/*
				Because flattenMomentVariables won't put the final moment's "passage" into the pastVisits
				array yet (because "visits" only applies to past passages, as per (history:)) we must do it
				ourselves here.
			*/
			first.pastVisits.push(excised[excised.length-1].passage);
			/*
				"turns" is only ever increased by (forget-undos:), and represents erased turns that must
				nonetheless be counted by the turns identifier. Here, each excised turn increments the counter.
			*/
			first.turns = (first.turns || 0) + excised.length;
			/*
				Rather than reconstruct the entire CurrentVariables based on the above change,
				it's simpler to just update its own "turns" in kind.
			*/
			CurrentVariables.turns = (CurrentVariables.turns || 0) + excised.length;
			/*
				If the first moment (that is, the only moment that cannot be undone past)
				has an forgetVisits number, erase all of the specified visits before it.
				Because all other moments can still be undone, their erased visits can't actually be erased yet.
			*/
			if (first.forgetVisits) {
				first.pastVisits = first.pastVisits.slice(first.forgetVisits - first.turns);
				/*
					Modify the forgetVisits number of this turn, now that (some of) the given visits are permanently erased,
					so that history() doesn't "erase" them again.
				*/
				first.forgetVisits -= first.turns;
			}
		
			serialisedPast = '';
			/*
				This handler updates all (link-undo:) and (icon-undo:) links
				whenever the *entire* past has been erased.
			*/
			if (recent === 0) {
				$("tw-link[undo], tw-icon[alt='Undo']", Utils.storyElement).each((_, link) => {
					($(link).closest('tw-expression, tw-hook').data('forgetUndosEvent') || Object)(link);
				});
			}
			
			// Call the 'forgetUndos' event handler.
			eventHandlers.forgetUndos.forEach(fn => fn());
		},

		forgetVisits(ind) {
			if (ind < 0) {
				ind = (timeline.length) + ind;
			}
			/*
				You can't erase visits from the turns after the current turn.
			*/
			if (ind > recent + CurrentVariables.turns) {
				ind = recent + CurrentVariables.turns;
			}
			present.forgetVisits = CurrentVariables.forgetVisits = Math.max(CurrentVariables.forgetVisits || 0, ind);
			reconstructCurrentHistory();
		},

		/*
			Did we ever visit this passage, given its name?
			Return the number of times visited.
		*/
		passageNameVisited(name) {
			let ret = 0;

			if (!Passages.get(name)) {
				return 0;
			}
			for (let i = 0; i < CurrentVariables.history.length; i++) {
				ret += +(name === CurrentVariables.history[i]);
			}

			return ret;
		},

		/*
			Direct access to the timeline. Used nowhere except for populating the Debug UI.
		*/
		get timeline() {
			return timeline;
		},

		/*
			Movers/shakers
		*/

		/*
			Push the present state to the timeline, and create a new state.
		*/
		play(newPassageName) {
			if (!present) {
				Utils.impossible("State.play","present is undefined!");
			}
			// Call the 'beforeForward' event handler. This doesn't take the passage name,
			// as it's intended for direction-agnostic events.
			eventHandlers.beforeForward.forEach(fn => fn());

			// Push the soon-to-be past passage name into the cache.
			if (present.passage) {
				/*
					If redirects were performed this turn, place the soon-to-be past passage name into the subarray holding those redirects.
				*/
				if (present.visits?.length && Array.isArray(CurrentVariables.pastVisits[CurrentVariables.pastVisits.length-1])) {
					CurrentVariables.pastVisits[CurrentVariables.pastVisits.length-1].push(present.passage);
				}
				else {
					/*
						Otherwise, just put the string at the end of the visits array.
					*/
					CurrentVariables.pastVisits.push(present.passage);
				}
				/*
					Also update the history cache, which is essentially a flattened version of pastVisits.
				*/
				CurrentVariables.history.push(present.passage);
			}
			// Assign the passage name.
			present.passage = newPassageName;

			// Clear the future, and add the present to the timeline.
			timeline = timeline.slice(0,recent+1).concat(present);
			recent += 1;
			
			// Create a new present
			newPresent(newPassageName);
			// Call the 'forward' event handler with this passage name.
			eventHandlers.forward.forEach(fn => fn(newPassageName));
		},

		/*
			Push the present state to the timeline, and create a new state.
		*/
		redirect(newPassageName) {
			if (!present) {
				Utils.impossible("State.redirect","present is undefined!");
			}
			// The departing passage name still goes into the cache.
			if (present.passage) {
				/*
					If previous redirects were performed this turn, place the soon-to-be past passage name into the subarray holding those redirects.
				*/
				if (present.visits?.length && Array.isArray(CurrentVariables.pastVisits[CurrentVariables.pastVisits.length-1])) {
					CurrentVariables.pastVisits[CurrentVariables.pastVisits.length-1].push(present.passage);
				}
				else {
					/*
						Otherwise, create a new sub-array.
					*/
					CurrentVariables.pastVisits.push([present.passage]);
				}
				/*
					Also update the history cache, which is essentially a flattened version of pastVisits.
				*/
				CurrentVariables.history.push(present.passage);
			}
			/*
				Each moment stores the passages visited by (redirect:)s that occured during it,
				solely for the sake of (history:). Note that this must be done AFTER the above, due to the present.visits.length check.
			*/
			present.visits = (present.visits || []).concat(newPassageName);
			// Assign the passage name.
			present.passage = newPassageName;
		},

		/*
			Rewind the state. This will fail and return false if the player is at the first moment.
		*/
		rewind(arg) {
			let steps = (arg !== undefined) ? arg : 1,
				moved = false;

			for (; steps > 0 && recent > 0; steps--) {
				moved = true;
				recent -= 1;
			}
			if (moved) {
				// Call the 'beforeBack' event handler.
				eventHandlers.beforeBack.forEach(fn => fn());

				serialisedPast = '';

				newPresent(timeline[recent].passage);
				/*
					Recompute the present variables based on the timeline.
				*/
				reconstructCurrentVariables();
				// Call the 'back' event handler.
				eventHandlers.back.forEach(fn => fn());
			}
			return moved;
		},

		/*
			Undo the rewinding of a state. Fails if no moments are in the future to be redone.
			Currently only accepts numbers.
			
			@param {Number} The number of turns to move forward.
			@return {Boolean} Whether the fast-forward was actually performed.
		*/
		fastForward(arg) {
			let steps = 1,
				moved = false;
			
			if (typeof arg === "number") {
				steps = arg;
			}
			for (; steps > 0 && timeline.length > 0; steps--) {
				moved = true;
				recent += 1;
			}
			if (moved) {
				eventHandlers.beforeForward.forEach(fn => fn());

				newPresent(timeline[recent].passage);
				/*
					Recompute the present variables based on the timeline.
				*/
				reconstructCurrentVariables();
				/*
					Call the 'fast forward' event handler. This is used exclusively by debug mode,
					which is why it has the "fastForward" direction string passed in.
				*/
				eventHandlers.forward.forEach(fn => fn(timeline[recent].passage, "fastForward"));
			}
			return moved;
		},

		/*
			This is used only by Debug Mode - it lets event handlers be registered and called when the State changes.
			"forward" functions have the signature (passageName, isFastForward). "back" functions have no signature.
			"load" functions have the signature (timeline), where timeline is the entire timeline Moments array.
		*/
		on(name, fn) {
			if (!(name in eventHandlers)) {
				Utils.impossible('State.on', 'invalid event name');
				return;
			}
			if (typeof fn === "function" && !eventHandlers[name].includes(fn)) {
				eventHandlers[name].push(fn);
			}
			return State;
		},

		/*
			This method is only for Harlowe debugging purposes. It is called nowhere except for the test specs
			and the documentation's live preview feature.
		*/
		reset() {
			eventHandlers.beforeLoad.forEach(fn => fn());
			timeline = [];
			recent = -1;
			reconstructCurrentVariables();
			present = Moment.create();
			present.seed = CurrentVariables.seed;
			present.seedIter = 0;
			serialisedPast = '';
			PRNG = mulberryMurmur32();
			eventHandlers.load.forEach(fn => fn(timeline));
		},

		hasStorage: hasStorage[0],
		hasSessionStorage: hasStorage[1],

		/*
			A way to set the RNG seed.
			The new seed and seedIter is stored as a hidden variable in present.variables.
		*/
		setSeed(seed) {
			PRNG = mulberryMurmur32(seed);
			present.seed = CurrentVariables.seed;
			present.seedIter = 0;
		},

		/*
			Used only by Runner.
		*/
		get seed() {
			return CurrentVariables.seed;
		},
		get seedIter() {
			return CurrentVariables.seedIter;
		},

		/*
			A way to call the current PRNG, while also storing the changed seedIter
			as a hidden variable in present.variables.
		*/
		random: () => {
			const ret = PRNG();
			present.seedIter = CurrentVariables.seedIter;
			return ret;
		},

		/*
			The following is an in-place Fisher–Yates shuffle.
			Used only in data structure macros and value macros.
		*/
		shuffled(...list) {
			const ret = list.reduce((a,e,ind) => {
				// Obtain a random number from 0 to ind inclusive.
				const j = (this.random()*(ind+1)) | 0;
				if (j === ind) {
					a.push(e);
				}
				else {
					a.push(a[j]);
					a[j] = e;
				}
				return a;
			},[]);
			present.seedIter = CurrentVariables.seedIter;
			return ret;
		},
	};

	/*
		In addition to the above simple methods, two serialisation methods are also present.
		These have a number of helper functions.
	*/

	/*
		Serialise the game history, from the present backward (ignoring the redo cache)
		into a JSON string.
		
		@return {Object|Boolean} The serialised state (in two strings), or false if serialisation failed.
	*/
	State.serialise = newPresent => {
		let whatToSerialise;
		/*
			- If serialisedPast isn't set yet, serialise everything up to the present.
			- At the start of each turn (i.e newPresent == true), serialise the recently finished moment,
			and the new moment.
			- During a turn (i.e. (save-game:) or whatever),
			serialise only the current moment (assume serialisedPast is up to date).
		*/
		whatToSerialise = timeline.slice(!serialisedPast ? 0 : newPresent ? recent-1 : recent, recent+1);

		/*
			This serialises a single variable from an object. This is used both for Moments' variables
			AND for custom commands' internal variables (which must be serialised too).
		*/
		const serialiseVar = (src, key) => {
			/*
				Serialising the TypeDefs, which is the only VariableStore property
				that isn't directly user-created, and is a plain JS object,
				requires a little special-casing.
			*/
			if (key === "TwineScript_TypeDefs") {
				const ret = {};
				for (let typeDef in src[key]) {
					/*
						Since the datatypes inside are Harlowe values,
						they should be serialised to source as well.
					*/
					ret[typeDef] = toSource(src[key][typeDef]);
				}
				return ret;
			}
			/*
				"null", representing deleted variables, is passed as-is to become a JSON null.
				(Currently (Jan 2022), though, nothing can delete values.)
			*/
			else if (src[key] === null) {
				return null;
			}
			/*
				Custom commands must be serialised in this rather complicated manner, involving a special TwineScript method
				for retrieving its internals.
			*/
			else if (src[key] && hasOwnProperty.call(src[key], 'TwineScript_CustomCommand')) {
				const desc = src[key].TwineScript_CustomCommand();
				const ret = {
					changer: toSource(desc.changer),
					toSource: desc.toSource,
					hook: toSource(desc.hook),
					variables: Object.keys(desc.variables).reduce((a,e) => {
						a[e] = serialiseVar(desc.variables, e);
						return a;
					}, {}),
				};
				return ret;
			}
			/*
				This should be every other value.
			*/
			return toSource(src[key]);
		};

		/*
			Note: This MUST NOT be an arrow function, because JSON.stringify uses 'this' in the given callback.
			As of Oct 2021, it's currently not decided what should happen when a mock visits savefile is loaded outside of Debug Mode.
		*/
		let serialiseFn = function (name, variable) {
			/*
				Special optimisation: when a Moment has no changed variables, redirects, seeds, or whatever,
				replace it with a string of just the passage name.
			*/
			if (Moment.isPrototypeOf(variable)) {
				if (variable.visits === undefined
						&& variable.turns === undefined
						&& variable.mockVisits  === undefined
						&& variable.forgetVisits === undefined
						&& variable.pastVisits === undefined
						&& variable.mockTurns  === undefined
						&& variable.seed === undefined
						&& variable.seedIter === undefined
						&& Object.keys(variable.variables).every(e => e.startsWith("TwineScript_"))) {
					return variable.passage;
				}
			}
			// If this is the ValueRefs object, don't serialise it
			// Note that the epoch doesn't have a valueRefs.
			if (Moment.isPrototypeOf(this) && name === "valueRefs") {
				return undefined;
			}
			/*
				Variables objects should be serialised such that only the variables inside
				the VariableStore are converted to Harlowe strings with toSource().
			*/
			if (Moment.isPrototypeOf(this) && name === "variables") {
				const ret = {};
				for (let key in this.variables) {
					if (this.valueRefs[key]) {
						/*
							Values with a reference are serialised as an object (generated in Runner by the "to" and "into" handler)
							of at least {at: passage name, from: index, to: index}, which is used to reconstruct the value
							when loading the save file.
						*/
						ret[key] = this.valueRefs[key];
					}
					else {
						ret[key] = serialiseVar(this.variables, key);
					}
				}
				return ret;
			}
			return variable;
		};
		let pastToSerialise = whatToSerialise.slice(0, -1);
		let updatedPast = serialisedPast;
		/*
			If there's no extra pastToSerialise, serialisedPast doesn't need to be updated.
		*/
		try {
			if (pastToSerialise.length) {
				/*
					The amount of ] marks that must be repeatedly sliced off with .slice(0,-1) and .slice(1) to
					concatenate these JSON serialised arrays together is very #awkward.
				*/
				updatedPast = (!updatedPast ? "[" : updatedPast.slice(0, -1) + ",") + JSON.stringify(pastToSerialise, serialiseFn).slice(1);
			}
			return {
				past: updatedPast,
				/*
					Currently, serialiseFn assumes that its input is an array of moments, and can't serialise a single moment by itself.
					Hence, while whatToSerialise.slice(-1) is a one-element array, the contained element can't be passed itself.
				*/
				pastAndPresent: updatedPast.slice(0, -1) + (updatedPast ? ',' : '[') + JSON.stringify(whatToSerialise.slice(-1), serialiseFn).slice(1),
			};
		}
		catch(e) {
			return { past: false, pastAndPresent: false };
		}
	};

	/*
		A quick method to recompile objects whose values are Harlowe code strings, taken directly
		from localStorage.
		Since this should only receive formerly-serialised data, we don't really need to care about the
		scope of the eval().
	*/
	function recompileValues(section, pastTimeline, moment, obj) {
		for (let key in obj) {
			if (hasOwnProperty.call(obj, key) && !key.startsWith("TwineScript_")) {
				if (typeof obj[key] === "object") {
					/*
						ValueRefs are objects consisting of { at, from, to } plus execution environment.
						whereas normal variables are strings of Harlowe source.

						Note that TypeDefs values can't be serialised as "reconstruct",
						so this check won't do anything unwanted to them.
					*/
					if (hasOwnProperty.call(obj[key],'at')) {
						/*
							Save and re-use this ValueRef for the next time the game is saved.
						*/
						moment.valueRefs[key] = obj[key];

						const {at,from,to,hash,seed,seedIter,blockedValues} = obj[key];
						
						/*
							If the passage was renamed since this save file was saved, throw an error instead of trying
							to find the value somewhere else.
						*/
						if (!Passages.has(at)) {
							throw Error(`The data refers to a passage named \`"${moment.passage}"\`, but it isn't in this story.`);
						}
						const source = Passages.get(at).get('source');
						/*
							If there is a stored hash, check if the definition of the value is indeed in the indicated place.
							First, the hash of the slice of the source is compared to the stored hash.
							If it fails​, iterate all over the passage to find a possible match.
						*/
						let definition = source.slice(from, to);
						if (hash !== undefined) {
							let newFrom = 0;
							let len = (to - from);
							while (Utils.hash(definition).toString(16) !== hash) {
								/*
									If we can't find a matching definition anywhere, throw an error instead of continuing.
								*/
								if (newFrom + len >= source.length) {
									/*
										This message assumes recompileVariables() always operates on global variables.
									*/
									throw Error(`The value (or type) of the variable \`$${key}\` couldn't be found in the passage \`"${at}"\`.`);
								}
								/*
									Check every other possible position exhaustively. This is slow, but should only occur in
									cases where save files from older versions of a story are being loaded in a newer version.
								*/
								newFrom += 1;
								if (newFrom === from) {
									newFrom += 1;
								}
								definition = source.slice(newFrom, newFrom + len);
							}
						}
						/*
							The tokens comprising the value ref are lexed. But, some preprocessing
							(currently, just blockedValues) must be done on them.
						*/
						const tokens = lex(definition, '', 'macro');
						/*
							If the value contains any number of random features, set the PRNG
							to the state it was at from the start.
							Note that since every recompileValues() consumer resets the PRNG afterward,
							this is safe.
						*/
						if (seed !== undefined && seedIter !== undefined) {
							PRNG = mulberryMurmur32(seed,seedIter);
						}
						/*
							Blocked values pose a problem: normally, Renderer marks these with blockedValue:true
							and creates instances of them that Section runs first as "blockers" to populate blockedValues.
							So, when Section is unblocked, the macros with blockedValue:true are replaced with a matching
							blockedValue. To replicate this phenomenon, we have to #awkward-ly copy the marking loop from Renderer.
						*/
						if (blockedValues !== undefined) {
							section.stackTop.blockedValues = blockedValues;
							tokens.forEach(function recur(token) {
								if (token.type !== "string" && token.type !== "hook") {
									token.children.every(recur);
								}
								if (token.type === "macro") {
									const name = Utils.insensitiveName(token.name);
									/*
										As with Renderer, these two names are hard-coded.
									*/
									if (name === "prompt" || name === "confirm") {
										token.blockedValue = true;
									}
								}
							});
						}
						obj[key] = section.eval(tokens);
					}
					/*
						If this is a 'via' valueRef, then there SHOULD be a previous value for this
						variable in a preceding turn. Retrieve that, and set it to the 'it' value
						for the section.
					*/
					else if (hasOwnProperty.call(obj[key],'via')) {
						for (let i = pastTimeline.length-1; i >= 0; i -= 1) {
							if (hasOwnProperty.call(pastTimeline[i].variables, key)) {
								section.Identifiers.it = pastTimeline[i].variables[key];
								break;
							}
						}
						obj[key] = section.eval(lex(obj[key].via, '', 'macro'));
						section.Identifiers.it = 0;
					}
					/*
						If this is a custom command (which is a { changer, hook, toSource, variables } object) then
						this slightly complicated recompilation is necessary.
					*/
					else if (hasOwnProperty.call(obj[key], 'changer')) {
						obj[key].changer = section.eval(lex(obj[key].changer, '', 'macro'));
						obj[key].hook    = section.eval(lex(obj[key].hook,    '', 'macro'));
						recompileValues(section, pastTimeline, moment, obj[key].variables);

						obj[key] = CustomCommand.create(obj[key]);
					}
				}
				else {
					obj[key] = section.eval(lex(obj[key], '', 'macro'));
				}
			}
			/*
				Compatibility with Harlowe 3.2.3.
			*/
			else if (key === "TwineScript_MockVisits") {
				moment.mockVisits = obj[key];
			}
		}
	}
	
	/*
		Deserialise the string and replace the current history.
		Since an error with save data isn't necessarily an author error, the errors returned
		by this function aren't TwineErrors.
	*/
	State.deserialise = (section, str) => {
		let newTimeline;
		
		try {
			newTimeline = JSON.parse(str);
		}
		catch(e) {
			return Error("The save data is unintelligible.");
		}
		/*
			Verify that the timeline is an array.
		*/
		if (!isArray(newTimeline)) {
			return Error("The save data isn't a sequence of past turns.");
		}
		
		for(let i = 0; i < newTimeline.length; i += 1) {
			let moment = newTimeline[i];
			/*
				If it's just a string, uncompress it into a full JSON "moment".
			*/
			if (typeof moment === "string") {
				moment = { passage: moment, variables: {} };
			}
			/*
				Here, we do some brief verification that the remaining moments in the array are
				objects with "passage" and "variables" keys.
			*/
			else if (typeof moment !== "object"
					|| !hasOwnProperty.call(moment,"variables")) {
				/*
					Rather than freak out, just disregard this object altogether.
				*/
				newTimeline.splice(i--,1);
				continue;
			}
			/*
				The valueRefs record is restored here (as it wasn't saved in the savefile for obvious reasons).
			*/
			moment.valueRefs = create(null);
			/*
				Clean the prototype of the variables object.
			*/
			moment.variables = assign(create(null), moment.variables);
			/*
				Check that the passage name in this moment corresponds to a real passage.
				As this is the most likely issue with invalid save data, this gets a precise message.
			*/
			if (!Passages.hasValid(moment.passage)) {
				return Error(`The data refers to a passage named \`"${moment.passage}"\`, but it isn't in this story.`);
			}
			/*
				If the variables object has a TypeDefs object, that needs to be recompiled as well.
			*/
			if (hasOwnProperty.call(moment.variables,'TwineScript_TypeDefs')) {
				/*
					Much like the variables, the datatypes are currently Harlowe code strings - though rather likely to be
					literals like "number" or "datamap".
				*/
				try {
					recompileValues(section, newTimeline.slice(0,i), moment, moment.variables.TwineScript_TypeDefs);
				} catch(e) {
					return Error(`The variable types on turn ${i+1} couldn't be reconstructed.${e.message ? ` (${e.message})` : ''}`);
				}
			}
			/*
				Compile all of the variables (which are currently Harlowe code strings) back into Harlowe values.
			*/
			try {
				recompileValues(section, newTimeline.slice(0,i), moment, moment.variables);
			} catch(e) {
				return Error(`The variables on turn ${i+1} couldn't be reconstructed.${e.message ? ` (${e.message})` : ''}`);
			}
			/*
				Re-establish the moment objects' prototype link to Moment.
			*/
			newTimeline[i] = assign(create(Moment), moment);
		}
		timeline = newTimeline;
		recent = timeline.length - 1;
		eventHandlers.load.forEach(fn => fn(timeline));
		serialisedPast = '';
		reconstructCurrentVariables();
		newPresent(timeline[recent].passage);
		return true;
	};
	
	Object.seal(Moment);
	return Object.freeze(State);
});

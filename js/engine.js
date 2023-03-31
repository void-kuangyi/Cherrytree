"use strict";
define('engine', ['jquery', 'utils', 'state', 'section', 'passages'],
($, Utils, State, Section, Passages) => {
	/*
		Utils.storyElement is a getter, so we need a reference to Utils as well
		as all of these methods.
	*/
	const {impossible, passageSelector, transitionOut, options} = Utils;
	
	/*
		Engine is a singleton class, responsible for rendering passages to the DOM.
	*/
	let Engine;
	let DebugMode;

	/*
		Creates the HTML structure of the <tw-passage>. Sub-function of showPassage().

		@return {jQuery}
	*/
	function createPassageElement () {
		const
			container = $('<tw-passage><tw-sidebar>'),
			sidebar = container.children('tw-sidebar');
		
		// The default sidebar buttons consist of Undo (Back) and Redo (Forward) buttons.
		// The event code for these is in macrolib/commands.js, alongside the various "icon" macros.
		const
			back = $('<tw-icon tabindex=0 alt="Undo" title="Undo">&#8630;</tw-icon>'),
			fwd  = $('<tw-icon tabindex=0 alt="Redo" title="Redo">&#8631;</tw-icon>');

		if (State.pastLength <= 0) {
			back.css("visibility", "hidden");
		}
		if (State.futureLength <= 0) {
			fwd.css( "visibility", "hidden");
		}
		sidebar.append(back, fwd);

		return container;
	}
	
	/*
		A small helper that adds a passage header or footer (or the main passage tree itself) to a given array.
		Because the array itself needs to be analysed (see below), this mutates the array in-place.
		setupPassage is a Passage map, or undefined if the main passage's name was given.
	*/
	function setupPassageElement(source, tagTypeOrPassageName, setupPassage) {
		let newToken;
		if (!setupPassage) {
			newToken = Passages.getTree(tagTypeOrPassageName);
		}
		else {
			const name = setupPassage.get('name');
			const tree = Passages.getTree(name);
			if (tree.children.length) {
				newToken = {
					type: 'include',
					tag: tagTypeOrPassageName,
					name,
					children: tree.children,
					text: tree.text,
				};
			}
		}
		if (!newToken) {
			return;
		}
		/*
			Normally, most markup can't punch out of headers or footers and infect all further transclusions. However, in Harlowe 3, due to undefined behaviour,
			unclosed markup can. So, to continue to support this in 3.3.0, the following code is used.
			if the last token's type is 'include' or 'root', insert the transcluded element inside it.
		*/
		let lastToken;
		while((lastToken = source[source.length-1]) && (lastToken.type === 'root' || lastToken.type === "include")) {
			if (!lastToken.children.some(child => child.type.startsWith('unclosed'))) {
				break;
			}
			/*
				So, the problem here is, we want to insert this transcluded element into the children of
				the previous transcluded element, but to do so would mutate the tree, which is definitely cached
				in Passages due to being a header/footer. So, we just "clone" both this token and its children array.
			*/
			source[source.length-1] = Object.create(lastToken);
			source = source[source.length-1].children = lastToken.children.slice();
		}
		source.push(newToken);
	}
	
	/*
		Shows a passage by transitioning the old passage(s) out, and then adds the new passages.

		displayOptions allows stretchtext (boolean), transitionIn (string)
		or transitionOut (string) to be selected.
	*/
	function showPassage (name, displayOptions = {}) {
		/*
			displayOptions should only contain 'stretch', 'transition' and 'loadgame' properties.
			The first two are used further below.
		*/
		const {loadedGame} = displayOptions;

		const
			// The passage
			passageData = Passages.get(name),
			// The <tw-story> element
			story = Utils.storyElement;

		let
			/*
				The <tw-story>'s parent is usually <body>, but if this game is embedded
				in a larger HTML page, it could be different.
			*/
			parent = story.parent(),
			{
				// Whether or not this should be a stretchtext transition
				stretch,
				// The transition definition object.
				transition: {
					depart: depart = "instant",
					arrive: arrive = "dissolve",
					departOrigin,
					arriveOrigin,
					time,
				} = {},
			} = displayOptions;

		/*
			Find each <tw-enchantment> with an "enchantedProperties" data name, which holds properties
			tweaked on <tw-story> to avoid CSS clashes, and unset those properties.
		*/
		parent.findAndFilter('tw-enchantment').each((_,e) => {
			e=$(e);
			const enchantedProperties = e.data('enchantedProperties');
			if (enchantedProperties) {
				/*
					An identical line to this appears in Enchantment.disenchant()
				*/
				story.css(enchantedProperties.reduce((a,e)=>(a[e] = "",a),{}));
			}
			/*
				If this is enchanting <tw-story>, then immediately disenchant.
				Note that since old passages take awhile to transition out, disenchanting everything
				else within them would be unwise.
			*/
			if (e[0] === parent[0]) {
				parent = story.unwrap().parent();
			}
		});

		/*
			Early exit: the wrong passage name was supplied.
			Author error must never propagate to this method - it should have been caught earlier.
		*/
		if (!Passages.hasValid(name)) {
			impossible("Engine.showPassage", "There's no passage with the name \""+name+"\"!");
		}
		
		/*
			Find out how many tw-passage elements there are currently in the
			destination element.
		*/
		const oldPassages = story.children(passageSelector).not(".transition-out, .transition-out *");

		const tags = (passageData.get('tags') || []).join(' ');
		const newPassage = createPassageElement();

		/*
			The departOrigin and arriveOrigin values can be functions that produce CSS property strings,
			similar to jQuery .css() objects. While Utils.transitionIn() can handle these, they sadly
			must be run before the element is detached from the DOM, as these functions tend to use .offset().
		*/
		if (typeof departOrigin === "function") {
			departOrigin = departOrigin.call(oldPassages);
		}
		if (typeof arriveOrigin === "function") {
			arriveOrigin = arriveOrigin.call(newPassage);
		}
		
		/*
			Because rendering a passage is a somewhat intensive DOM manipulation,
			the <tw-story> is detached before and reattached after.
		*/
		Utils.detachStoryElement();

		/*
			Make the passage's tags visible in the DOM, on both the <tw-passage> and
			the <tw-story>, for user CSS availability.
		*/
		newPassage.appendTo(story).attr({tags});

		/*
			If this isn't a stretchtext transition, send away all of the
			old passage instances.
		*/
		if (!stretch && depart) {
			transitionOut(oldPassages, depart, time, 0, 0, 0, departOrigin);
			/*
				This extra adjustment is separate from the transitionOut method,
				as it should only apply to the block-level elements that are
				passages. It enables the new transitioning-in passage to be drawn
				over the departing passage. Note: this may prove to be too restrictive
				in the future and need to be made more subtle.
			*/
			oldPassages.css('position','absolute');
		}

		/*
			Only the most recent passage's tags are present on the <tw-story>.
		*/
		story.attr({tags});
		
		const section = Section.create(newPassage);
		/*
			The 'loadgame' display option should prevent (load-game:) loops from happening
			(loading directly into a (load-game:) macro).
		*/
		if (loadedGame) {
			section.loadedGame = true;
		}

		/*
			Actually do the work of rendering the passage now.
		*/
		const source = [];
		/*
			We add, to the passage source, the source of the 'header' and 'footer' tagged passages.
			We explicitly include these passages inside <tw-header> elements
			so that they're visible to the author when they're in debug mode, and can clearly
			see the effect they have on the passage.
		*/
		/*d:
			header tag

			It is often very useful to want to reuse a certain set of macro calls in every passage,
			or to reuse an opening block of text. You can do this by giving the passage the special
			tag `header`, or `footer`. All passages with these tags will have their source text included at the top
			(or, for `footer`, the bottom) of every passage in the story, as if by an invisible (display:) macro call.

			If many passages have the `header` tag, they will all be displayed, ordered by their passage
			name, sorted alphabetically, and by case (capitalised names appearing before lowercase names).

			#transclusion 1
		*/
		/*d:
			debug-header tag
			
			This special tag is similar to the `header` tag, but only causes the passage
			to be included if you're running the story in debug mode.

			This has a variety of uses: you can put special debug display code in this
			passage, which can show the status of certain variables or provide links
			to change the game state as you see fit, and have that code
			be present in every passage in the story, but only during testing.

			All passages tagged with `debug-header` will run after the passages tagged `header` will run,
			ordered by their passage name, sorted alphabetically, and by case (capitalised names appearing
			before lowercase names).

			#transclusion 4
		*/
		/*d:
			footer tag

			This special tag is identical to the `header` tag, except that it places the passage
			at the bottom of all visited passages, instead of the top.

			#transclusion 2
		*/
		/*d:
			debug-footer tag
			
			This special tag is identical to the `debug-header` tag, except that it places the passage
			at the bottom of all visited passages, instead of the top.

			All passages tagged with `debug-footer` will run, in alphabetical order
			by their passage name, after the passages tagged `footer` have been run.

			#transclusion 5
		*/
		/*
			We only add the startup and debug-startup passages if this is the very first passage.
			Note that the way in which source is modified means that startup code
			runs before header code.
		*/
		/*d:
			startup tag

			This special tag is similar to `header`, but it will only cause the passage
			to be included in the very first passage in the game.

			This is intended to simplify the story testing process: if you have setup
			code which creates variables used throughout the entire story, you should put it in
			a passage with this tag, instead of the starting passage. This allows you to test your
			story from any passage, and, furthermore, easily change the starting passage if you wish.

			All passages tagged with `startup` will run, in alphabetical order
			by their passage name, before the passages tagged `header` will run.

			#transclusion 3
		*/
		/*d:
			debug-startup tag
			
			This special tag is similar to the `startup` tag, but only causes the passage
			to be included if you're running the story in debug mode.

			This has a variety of uses: you can put special debugging code into this
			passage, or set up a late game state to test, and have that code run
			whenever you use debug mode, no matter which passage you choose to test.

			All passages tagged with `debug-startup` will run, in alphabetical order
			by their passage name, after the passages tagged `startup` will run.

			#transclusion 6
		*/
		/*
			Only run the startup passage if no past turns exist and if no turns were erased.
		*/
		if (State.pastLength <= 0 && State.turns === 1) {
			for(let p of Passages.getTagged('startup')) {
				setupPassageElement(source, 'startup', p);
			}
			if (options.debug) {
				for(let p of Passages.getTagged('debug-startup')) {
					setupPassageElement(source, 'debug-startup', p);
				}
			}
		}
		for(let p of Passages.getTagged('header')) {
			setupPassageElement(source, 'header', p);
		}
		if (options.debug) {
			for(let p of Passages.getTagged('debug-header')) {
				setupPassageElement(source, 'debug-header', p);
			}
		}
		setupPassageElement(source, name);
		for(let p of Passages.getTagged('footer')) {
			setupPassageElement(source, 'footer', p);
		}
		if (options.debug) {
			for(let p of Passages.getTagged('debug-footer')) {
				setupPassageElement(source, 'debug-footer', p);
			}
		}
		
		/*
			Then, run the actual passage.
		*/
		section.renderInto(
			source,
			newPassage,
			/*
				Use the author's styles, assigned using TwineScript,
				as well as this basic, default ChangeDescriptor-like object
				supplying the transition.
			*/
			{ transition: arrive, transitionTime: time, transitionOrigin: arriveOrigin }
		);

		/*
			Re-enable (load-game:) usage immediately after the passage has rendered. While this won't stop
			certain (load-game:) loops caused by guarding each call with very low (after:) timeouts or whatnot,
			it's still fairly good at stopping unintentional loops.
		*/
		section.loadedGame = false;
		
		Utils.reattachStoryElement();
		/*
			In stretchtext, scroll the window to the top of the inserted element,
			minus an offset of 5% of the viewport's height.
			Outside of stretchtext, just scroll to the top of the <tw-story>'s element.
		*/
		scroll(
			0,
			stretch
				? newPassage.offset().top - ($(window).height() * 0.05)
				: story[0].getBoundingClientRect().top + document.body.scrollTop
		);
	}
	
	Engine = {
		
		/*
			Moves the game state backward one turn. If there is no previous state, this does nothing.
		*/
		goBack(displayOptions) {
			if (State.rewind()) {
				showPassage(State.passage, displayOptions);
			}
		},

		/*
			Moves the game state forward one turn, after a previous goBack().
		*/
		goForward(displayOptions) {
			if (State.fastForward()) {
				showPassage(State.passage, displayOptions);
			}
		},

		/*
			Displays a new passage, advancing the game state forward.
		*/
		goToPassage(id, displayOptions) {
			// Update the state.
			State.play(id);
			showPassage(id, displayOptions);
		},

		/*
			Displays a new passage, WITHOUT advancing the game state forward.
		*/
		redirect(id, displayOptions) {
			State.redirect(id);
			showPassage(id, displayOptions);
		},

		toggleFullscreen() {
			const html = document.documentElement;
			/*
				A little bit of finagling with the method names is necessary for IE 11 support (as of Sep 2020).
			*/
			if (document.fullscreenElement) {
				document.exitFullscreen();
			} else if (document.msFullscreenElement) {
				document.msExitFullscreen();
			}
			else {
				/*
					This currently doesn't do anything if the fullscreen request fails, on the extremely blithe assumption that
					fullscreen access wouldn't have changed between the check for fullscreenEnabled when the passage was created,
					and this button being clicked.
				*/
				(html.msRequestFullscreen || html.requestFullscreen).call(
					/*
						The <tw-story> element can't be used as the fullscreen element, because it's detached and reattached often
						(including when it's enchanted with (enchant:?page)).
						Using <html> also has the advantage of bringing along the debug panel for the ride into fullscreen.
					*/
					html
				);
			}
		},
		
		/*
			Displays a new passage WITHOUT changing the game state.
			Used exclusively by state-loading routines.
		*/
		showPassage,

		/*
			Used by (debug:) to launch the debugger if it's not open already.
		*/
		enableDebugMode() {
			DebugMode && DebugMode();
		},

		/*
			Used to resolve a circular dependency with debugmode/mode and engine. debugmode/mode registers itself using
			this one-time method.
		*/
		registerDebugMode(mode) {
			!DebugMode && (DebugMode = mode);
		},
	};
	
	return Object.freeze(Engine);
});

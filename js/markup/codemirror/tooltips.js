/*eslint strict:[2,"function"]*/
(function() {
	'use strict';
	let ShortDefs, twine23, insensitiveName;
	
	// this.loaded implies TwineJS 2.3.
	if (this && this.loaded) {
		({ShortDefs, twine23, insensitiveName} = this.modules.Utils);
	}
	// This can't be loaded in HarloweDocs.
	else if (!this.window) {
		({ShortDefs, twine23, insensitiveName} = this.Utils);
	}

	const docsURL = (anchor, contents) => `<a href="https://twine2.neocities.org/#${anchor}" target="_blank" rel="noopener noreferrer">${contents}</a>`;

	const enclosedText = "This markup gives the enclosed text ";
	const producesBooleanTrueIf = c => `The <b>"${c}" operator</b> produces the boolean value \`true\` if `;
	const otherwiseFalse = ` Otherwise, it produces \`false\`.`;
	const variableInProse =  `If they contain strings, numbers, commands or changers, you can place them directly in your prose to display the value, run the command, or apply the changer.`;
	const lambdaClause = c => `The keyword <b>"${c}"</b> makes the code on the right into a <b>"${c}" lambda clause</b>. `;
	const specialHookName = (name, what) => `<br><br>Additionally, because it uses the special name "\`${name}\`", it also refers to <b>${what}</b>, and can be used to apply changers to ${what}.`;
	const onlyMatches = `Only matches `;
	/*
		The following MUST be synched up with the documentation for datatypes in datatypes/datatype.js!
	*/
	const datatypeDefs = {
		num: onlyMatches + `numbers.`,
		str: onlyMatches + `strings.`,
		bool: onlyMatches + `booleans.`,
		array: onlyMatches + `arrays.`,
		dm: onlyMatches + `datamaps.`,
		ds: onlyMatches + `datasets.`,
		command: onlyMatches + `commands.`,
		changer: onlyMatches + `changers.`,
		color: onlyMatches + `colours.`,
		gradient: onlyMatches + `gradients.`,
		lambda: onlyMatches + `lambdas.`,
		macro: onlyMatches + `custom macros.`,
		datatype: onlyMatches + `other datatypes.`,
		codehook: onlyMatches + `code hooks.`,
		even: onlyMatches + `even numbers.`,
		odd: onlyMatches + `odd numbers.`,
		int: onlyMatches + `whole numbers (numbers with no fractional component, and which are positive or negative).`,
		empty: onlyMatches + `these empty structures: <code>""</code> (the empty string), <code>(a:)</code>, <code>(dm:)</code> and <code>(ds:)</code>.`,
		whitespace: onlyMatches + `a single character of whitespace (spaces, newlines, and other kinds of space).`,
		lowercase: onlyMatches + `a single lowercase character. Lowercase characters are characters that change when put through <code>(uppercase:)</code>.`,
		uppercase: onlyMatches + `a single uppercase character. Uppercase characters are characters that change when put through <code>(lowercase:)</code>.`,
		anycase: `This matches any character which is case-sensitive - that is, where its <code>(lowercase:)</code> form doesn't match its <code>(uppercase:)</code> form.`,
		alnum: onlyMatches + `a single alphanumeric character (letters and numbers).`,
		digit: onlyMatches + `a string consisting of exactly one of the characters '0', '1', '2', '3', '4', '5', '6', '7', '8', and '9'.`,
		newline: onlyMatches + `a line break character (also known as a "newline" character).`,
		const: `Matches nothing; Use this only with <code>(set:)</code> to make constants.`,
		any: `Matches anything; Use this with <code>(macro:)</code> to make variables that accept any storable type, or with <code>(set:)</code> inside data structure patterns.`,
	};
	Object.assign(datatypeDefs, {
		number: datatypeDefs.num,
		string: datatypeDefs.str,
		boolean: datatypeDefs.bool,
		datamap: datatypeDefs.dm,
		dataset: datatypeDefs.ds,
		colour: datatypeDefs.color,
		integer: datatypeDefs.int,
		alphanumeric: datatypeDefs.alnum,
		linebreak: datatypeDefs.newline,
	});
	const tooltipMessages = {
		hr:                  "This is a <b>horizontal rule</b>. It extends across the entire passage width (or the column width, if it's in a column).",
		bulleted:            "The `*` at the start of this line makes this a <b>bulleted list item</b>.",
		numbered:            "The `0.` at the start of this line makes this a <b>numbered list item</b>.",
		heading:             ({depth}) => `This is a <b>level ${depth} ${depth===1 ? "(largest) " : ""}heading</b> mark.`,
		align:               ({align}) => `This is an <b>aligner</b> mark. The text after this is ${align === "justify" ? "justified (spaced out to touch both edges)" : `aligned to the ${align}`}. `
								+ "Write `<==` for left alignment, `==>` for right alignment, `=><=` for centering, and `<==>` for justified alignment.",
		column:              ({text, width, marginRight, marginLeft}) =>
								text.trim().startsWith("|") && text.trim().endsWith("|") ? "This mark ends all of the preceding columns. The text after this is not in a column."
								: `The text after this mark is in a <b>column</b> with width multiplier ${width}x, a left margin of ${marginLeft}em, and a right margin of ${marginRight}em. `
								+ "Write more consecutive `|` marks to increase the width, and place `=` to the left and right to increase the margin on that side.",
		em:                  enclosedText + "<b>emphasis style</b>. This is visually the same as italic style by default.",
		strong:              enclosedText + "<b>strong emphasis style</b>. This is visually the same as bold style by default.",
		bold:                enclosedText + "<b>bold style</b>.",
		italic:              enclosedText + "<b>italic style</b>.",
		strike:              enclosedText + "<b>strikethrough style</b>.",
		sup:                 enclosedText + "<b>superscript style</b>.",
		comment:             "This is a <b>HTML comment</b>. Everything inside it will be ignored by Harlowe.",
		scriptStyleTag:      () => tooltipMessages.tag,
		tag:                 "This is a <b>HTML tag</b>. Harlowe supports raw HTML in passage code.",
		hook: ({type, name, tagPosition}) => (type === "hook" ? `These square brackets are a <b>hook</b>, enclosing this section of passage code.` : '')
			+ ` Changer values can be attached to the left of hooks.`
			+ (name ? `<br>This hook has a <b>nametag</b> on the ${
				tagPosition === "prepended" ? "left" : "right"
			}. This allows the hook to be referred to in macro calls using the hook name <code>?${
				name
			}</code>.` : ''),
		unclosedHook:        token => `This marks all of the remaining code in the passage as being inside a <b>hook</b>.` + tooltipMessages.hook(token),
		verbatim:            "This is <b>verbatim markup</b>. Place text between matching pairs and amounts of <code>`</code> marks, and Harlowe will ignore the markup within, instead displaying it as-is.",
		unclosedCollapsed:   token => tooltipMessages.collapsed(token),
		collapsed:           ({type}) => `This is <b>${
									type === "unclosedCollapsed" ? "unclosed " : ''
								}collapsed whitespace</b> markup. All sequences of consecutive whitespace within ${
									type === "unclosedCollapsed" ? "the remainder of the passage " : 'the <code>{</code> and <code>}</code> marks'
								} will be replaced with a single space. You can use this to space out your code and keep your passage readable.<br>To include a line break within this markup that will be preserved, use a HTML <code>&lt;br&gt;</code> tag.`,
		escapedLine:         `This is an <b>escaped line break</b> mark. This removes the line break before or after it from the displayed passage.`,
		twineLink:           ({passage}) => `This is a <b>link to the passage "${passage}"</b>. Links, like hooks and commands, can have changer values attached to the left.`,
		br:                  ``, // Display nothing,
		url:                 ``,
		variable:            `This is a <b>story-wide variable</b>. After this has been set to a data value, it can be used anywhere else in the story. Use these to store data values related to your story's game state, or changers that are commonly used. ` + variableInProse,
		tempVariable:        `This is a <b>temp variable</b>. It can be used in the same passage and hook in which it's first set to a data value. Use these to store values temporarily, or that won't be needed elsewhere. ` + variableInProse,
		macroName:           (_,[,parent]) => tooltipMessages.macro(parent),
		grouping:            `Use these <b>grouping brackets</b> to ensure operations are performed in a certain order. Code in brackets will be computed before the code adjacent to it.`,
		property:            ({type, name}) => (name ? `This retrieves the data stored at <b>the \`${name}\` ${
										name.match(/^\d+(?:th|nd|st|rd)(?:last)?(?:to\d+(?:nth|nd|st|rd)(?:last)?)?$/g) ? `position${name.includes('to') ? 's' : ''}` : 'name'
									}</b> of the container value on the ${type.startsWith('belonging') ? "right" : "left"}.<br><br>` : '')
								+ "Some types of data values (arrays, datamaps, datasets, strings, colours, gradients, custom macros, and typedvars) are also storage containers for other values. "
								+ "You can access a specific value stored in them using that value's <b>data name</b> (or a string, number, or array value in brackets) by writing <i>value</i> `'s` <i>name</i>, or <i>name</i> `of` <i>value</i>.",
		possessiveOperator:  token => tooltipMessages.property(token),
		itsProperty:         token => tooltipMessages.property(token),
		itsOperator:         token => tooltipMessages.identifier(token),
		belongingItProperty: token => tooltipMessages.property(token),
		belongingItOperator: token => tooltipMessages.property(token),
		belongingProperty:   token => tooltipMessages.property(token),
		belongingOperator:   token => tooltipMessages.property(token),
		escapedStringChar:   ``,
		string:              `This is <b>string data</b>. Strings are sequences of text data enclosed in matching " or ' marks. Use a \`\\\` inside a string to "escape" the next character. Escaped " or ' marks don't count as the end of the string.<br><br>`
								+ `If a string matches a passage name, it will be <span class="cm-harlowe-3-passageString">underlined</span>. If it matches a tag name, it will be <span class="cm-harlowe-3-tagString">dotted</span>.`,
		hookName:            ({name}) => {
			name = name.toLowerCase();
			return `This <b>hook name</b> refers to all hooks named "\`${name}\`" in this passage.`
				+ (name === "page" ? specialHookName('page','the entire HTML page')
					: name === "passage" ? specialHookName('passage','the entire passage')
					: name === "link" ? specialHookName('link','every link in the passage')
					: name === "sidebar" ? specialHookName('sidebar','the sidebar')
					: '');
		},
		cssTime:             ({value}) => `This is <b>number data</b> in CSS time format. Harlowe automatically converts this to a number of milliseconds, so this is identical to ${value}.`,
		datatype:            ({text}) => {
			text = text.toLowerCase();
			return `This is the name of a <b>datatype</b>. Use these names to check what kind of data a data value is, using the \`matches\` or \`is a\` operators.<br>`
				+ `You can also use them in a \`(set:)\` or \`(put:)\` to restrict that variable's data for error-checking purposes. (See ${docsURL('type_datatype', 'the documentation')} for details.)`
				+ (hasOwnProperty.call(datatypeDefs,text) ? `<code class='harlowe-3-tooltipMacroSignature cm-harlowe-3-datatype'>${text}</code>${datatypeDefs[text]}` : '');
		},
		colour:              ({text}) => `This is a ` + (text.startsWith('#')
								? "<b>HTML colour value</b>. Harlowe can use this as colour data."
								: `built-in Harlowe <b>colour value</b>. The built-in colours are \`red\`, \`orange\`, \`yellow\`, \`lime\`, \`green\`, \`cyan\` (alias \`aqua\`), \`blue\`, \`navy\`, \`purple\`, \`fuchsia\` (alias \`magenta\`), \`white\`, \`gray\` (alias \`grey\`), \`black\`, and \`transparent\`.`),
		number:              `This is <b>number data</b>. Harlowe supports whole numbers (like \`2\`), negative numbers (like \`-2\`), and numbers with a decimal fraction component (like \`2.2\`).`,
		inequality:          ({operator, negate}) => {
			operator = (negate ? ({
					'>' :     '<=',
					'<' :     '>=',
					'>=':     '<',
					'<=':     '>',
				}[operator]) : operator);
			const operatorEng = (operator[0] === ">" ? "greater " : "less ") + "than" + (operator.endsWith('=') ? " or equal to" : "");
			return producesBooleanTrueIf(operatorEng) + ` the number value on the left is ${operatorEng} the number value on the right.` + otherwiseFalse;
		},
		augmentedAssign:     `This is an <b>augmented assignment operator</b>, similar to the ones in Javascript.`,
		identifier: ({text}) => {
			text = insensitiveName(text);
			if (text.startsWith("it")) {
				return `The keyword <b>it</b> is a shorthand for the leftmost part of an operation. You can write \`(if: $candles < 2 and it > 5)\` instead of \`(if: $candles < 2 and $candles > 5)\` `
					+ `or \`(set: $candles to it + 3)\` instead of \`(set: $candles to $candles + 3)\`. When accessing a data value from it, you can write it as <b>its</b>, such as in \`its length > 0\`.`;
			}
			if (text === "time") {
				return `The keyword <b>time</b> equals the number of milliseconds passed since the passage was displayed.`;
			}
			if (text.startsWith("exit")) {
				return `The keyword <b>exits</b> or <b>exit</b> equals the number of currently available "exits" in a passage - the number of`
					+ ` link, mouseover, and mouseout elements that are still active on the page, which could lead to new content and progress.`;
			}
			if (text.startsWith("visit")) {
				return `The keyword <b>visits</b> or <b>visit</b> equals the number of times the current passage has been visited this game, including the current visit.`
					+ ` In \`(storylet:)\` macros, when Harlowe decides whether this passage is available to \`(open-storylets:)\`, this will often be 0, but when actually visiting the passage, it will be at least 1.`;
			}
			if (text === "pos") {
				return `The keyword <b>pos</b> should ONLY be used within a "where" or "via" lambda clause. It refers to the position of the current data value that this lambda is processing.`;
			}
			return '';
		},
		whitespace:          `<b>Whitespace</b> within macro calls is simply used to separate syntax elements. You can use as much or as little as you like to make your code more readable.`,
		error:               (_,[{message, explanation}]) => message + (explanation ? "<br>" + explanation : ''),
		boolean:             `The keywords <b>true</b> or <b>false</b> are the two <b>boolean values</b>. They are produced by comparison operators (\`<\`, \`>\`, \`is\`, etc.) and other macros.`,
		is:                  `The <b>"is" operator</b> produces the boolean value \`true\` if the values on each sides of it are exactly the same.` + otherwiseFalse,
		to:                  `Use the <b>"to" operator</b> only inside a \`(set:)\` macro call. Place it to the left of the data, and right of the variable to set the data to.`,
		into:                `Use the <b>"into" operator</b> only inside a \`(put:)\`, \`(move:)\` or \`(unpack:)\` macro call. Place it to the right of the data, and left of the destination to put the data.`,
		where:               lambdaClause('where') + `This lambda will search for input values <i>where</i> the right side, once computed, produces \`true\`.`,
		when:                lambdaClause('when') + `This lambda will cause the macro (if it accepts "when" lambdas) to only do something <i>when</i> the right side, once computed, produces \`true\`.`,
		via:                 lambdaClause('via') + `This lambda is used to convert input values into new values <i>via</i> computing the expression to the right.`,
		making:              lambdaClause('making') + `This is used only by the \`(folded:)\` macro. The lambda <i>makes</i> the temp variable on the right, which becomes the final value of the \`(folded:)\` call.`,
		each:                lambdaClause('each') + `This causes the macro (if it accepts lambdas) to, for <i>each</i> input value, place that value in the temp variable on the right, before running the other lambda clauses adjacent to this one (if any).`,
		and:                 producesBooleanTrueIf('and') + `the values on each side of it are both \`true\`.` + otherwiseFalse,
		or:                  producesBooleanTrueIf('or') + `the values on each side of it are both \`false\`.` + otherwiseFalse,
		not:                 `The <b>"not" operator</b> inverts the boolean value to its right, turning \`true\` to \`false\` and vice-versa.`,
		isNot:               producesBooleanTrueIf('is not') + `the values on each sides of it are NOT exactly the same.` + otherwiseFalse,
		contains:            producesBooleanTrueIf('contains') + `the array, string, or dataset on the left contains the data on the right, or if the datamap on the left has the data name on the right.` + otherwiseFalse,
		doesNotContain:      producesBooleanTrueIf('does not contain') + `the array, string, or dataset on the left does NOT contain the data on the right, or if the datamap on the left does NOT have the data name on the right.` + otherwiseFalse,
		isIn:                producesBooleanTrueIf('is in') + `the data on the left is in the array, string, datamap or dataset on the right.` + otherwiseFalse,
		isA:                 producesBooleanTrueIf('is a') + "the data on the left matches the datatype on the right." + otherwiseFalse,
		isNotA:              producesBooleanTrueIf('is not a') + "the data on the left does NOT match the datatype on the right." + otherwiseFalse,
		isNotIn:             producesBooleanTrueIf('is not in') + `the data on the left is NOT in the array, string, datamap or dataset on the right.` + otherwiseFalse,
		matches:             producesBooleanTrueIf('matches') + "one side describes the other - that is, if one side is a datatype that describes the other, "
								+ "or both sides are arrays, datamaps, or datasets, with data in positions that matches those in the other, or if both sides are equal." + otherwiseFalse,
		doesNotMatch:        producesBooleanTrueIf('does not match') + "one side does NOT describe the other." + otherwiseFalse,
		bind:                `The <b>bind</b> or <b>2bind</b> keyword specifies that the variable to the right should be "bound" to an interactable element. This is used only by certain command macros, like \`(dialog:)\` or \`(cycling-link:)\`.`,
		comma:               `Use <b>commas</b> to separate the values that you give to macro calls.`,
		spread:              `This is a <b>spreader</b>. These spread out the values in the array, string or dataset to the right of it, as if each value was individually placed in the call and separated with commas.`
								+ `<br><br>Alternatively, if a datatype is to the right of it, that datatype becomes a <b>spread datatype</b> that matches zero or more of itself.`,
		typeSignature:       `The <b>-type</b> suffix is used to restrict the variable on the right to only holding data that matches the data pattern on the left. Variables restricted in this way are called <b>typed variables</b>.`,
		addition:            `Use the <b>addition operator</b> to add two numbers together, as well as join two strings or two arrays, and combine two datamaps, two datasets, two changers, or two colours.`
								+ ` This operator can also combine two hook names, creating a hook name that applies to both sets of hooks.`,
		subtraction:         `Use the <b>subtraction operator</b> to subtract two numbers, as well as create a copy of the array or dataset on the left that doesn't contain values of the array or dataset on the right.`,
		multiplication:      `Use the <b>multiplication operator</b> to multiply two numbers.`,
		division:            ({text}) =>
			`${text === '/' ? `Use the <b>division operator</b> to divide` : `Use the <b>modulo operator</b> to get the remainder (modulo) from dividing`} two numbers. Dividing a number by 0 produces an error.`,
		macro: ({name}) => {
			if (name === undefined) {
				return `This macro call is incomplete or erroneously written. Macro calls should consist of \`(\`, the name (which is case-insensitive and dash-insensitive), \`:\`, zero or more expressions separated by commas, then \`)\`, in that order.`;
			}
			if (name[0] === "_" || name[0] === "$") {
				return `This is a <b>call to a custom macro stored in the ${name} variable</b>. Custom macros are created with the \`(macro:)\` macro, and must be stored in variables in order to be used.`;
			}
			const defs = ShortDefs.Macro[insensitiveName(name)];
			if (!defs) {
				return `This is a call to a nonexistent or misspelled macro. This will cause an error.`;
			}
			const rt = defs.returnType.toLowerCase();
			return `This is a <b>call to the \`(${defs.name}:)\` macro</b>. ${
					rt === "metadata" ? `Metadata macros like this should be placed at the very top of the passage, before all other macros.` :
					rt === "instant" || rt === "command" ? `It produces a <span class="cm-harlowe-3-macroName-command">command</span>, so it should appear in passage code without being connected to a hook.` :
					rt === "changer" ? `It produces a <span class="cm-harlowe-3-macroName-changer">changer</span>, which can be placed to the left of a hook or a command (passage links are commands), or combined with other changers.` :
					rt === "any" || rt === "string" ? "" :
					`Since it produces a <span class="cm-harlowe-3-macroName-${rt}">${rt}</span>, it should be nested inside another macro call that can use ${rt} (or any) data.${
						rt === "array" || rt === "dataset" ? " You may also use it in a macro call which can accept any number of values, and spread its contents out using the spreader `...` syntax." : ''
					}`
				}${
					rt === "command" || rt === "changer" ? " You may also put it in a variable to reuse it multiple times, like other kinds of data." : ""
				}<code class='harlowe-3-tooltipMacroSignature'>${
					docsURL(defs.anchor, `(${defs.name}: ${defs.sig}) -> ${defs.returnType}`)
				}</code>${defs.aka.length ? `<div><i>Also known as: ${
					defs.aka.map(alias => `<code>(${alias}:)</code>`).join(', ')
				}</i>` : ''}</div><div>${
					defs.abstract
				}</div>`;
		},
		text: ({text}, path) => {
			if (text.trim()) {
				const insideMacro = path.reduce((a,t) =>
						a === undefined ? t.type === "macro" ? true : t.type === "hook" ? false : a : a,
						undefined
					);
				if (insideMacro) {
					return `This doesn't seem to be valid code.<br>Note that inside macro calls, only other macro calls, data, operators and whitespace are permitted.`;
				}
			}
		},
	};

	const tooltipElem = document.createElement("div");
	tooltipElem.className = "harlowe-3-tooltip";
	let tooltipAppearDelay = 0;
	let tooltipDismissTicker = 0;
	let tooltipToggleHints = 4;
	/*
		If the tooltip has a menu, this is the state of the cursor of that menu.
	*/
	let tooltipMenuCursor = 0;
	let tooltipMenuLength = 0;
	let tooltipMenuCallback = Object;

	function tooltipAppear() {
		if (tooltipAppearDelay < 1) {
			tooltipElem.style.display = "";
			// Dismiss the newly-appeared tooltip after this many mousemove events.
			tooltipDismissTicker = 10;
		} else {
			tooltipAppearDelay -= 1;
			requestAnimationFrame(tooltipAppear);
		}
	}

	const tooltipMenuKeymap = {
		Up()       { updateTooltipMenuCursor(Math.max(0, tooltipMenuCursor-1)); },
		Down()     { updateTooltipMenuCursor(Math.min(tooltipMenuLength-1, tooltipMenuCursor+1)); },
		PageUp()   { updateTooltipMenuCursor(0); },
		PageDown() { updateTooltipMenuCursor(tooltipMenuLength-1); },
		Home()     { updateTooltipMenuCursor(0); },
		End()      { updateTooltipMenuCursor(tooltipMenuLength-1); },
		Enter()    { tooltipMenuCallback(tooltipMenuCursor); },
		Tab()      { tooltipMenuCallback(tooltipMenuCursor); },
		// Esc is missing - because it collides with Twine 2, it must be overridden as a DOM event.
	};

	function tooltipClear() {
		tooltipMenuCursor = 0;
		tooltipMenuCallback = Object;
		tooltipElem.setAttribute('style', 'display:none');
	}

	const docCursorPlus = (doc,a) => doc.posFromIndex(doc.indexFromPos(doc.getCursor()) + a);

	// Added by positionTooltip()
	const twine2KeymapOverride = e => {
		if (tooltipElem.getAttribute('style') !== "display:none") {
			// Kludge to allow a tooltip to be closed without closing the dialog
			if (e.key === "Escape") {
				tooltipClear();
				e.stopPropagation();
			}
		}
	};

	function positionTooltip(cm, cursor, tail = false) {
		tooltipElem.removeAttribute('style');
		const {width} = tooltipElem.getBoundingClientRect();
		const cmElem = cm.display.wrapper;
		const {width:maxWidth} = cmElem.getBoundingClientRect();
		const coords = cm.charCoords(cursor, 'local');
		const gutterWidth = twine23 ? 30 : 0;
		/*
			If there is a tail, center the tooltip.
			Otherwise, position to the right of the cursor.
		*/
		const tipLeft = Math.min(maxWidth-width, Math.max(((coords.left|0) + gutterWidth) - (tail ? width/2 : 0), gutterWidth));
		tooltipElem.setAttribute('style', `left:${tipLeft}px; top:${(coords.top|0) + (tail ? 30 : 24) - cmElem.querySelector('.CodeMirror-scroll').scrollTop}px;`);

		if (tail) {
			// Place the tail at the correct location;
			tooltipElem.lastChild.setAttribute('style', `left:${coords.right - tipLeft + (twine23 ? (coords.right - coords.left)/2 + 6 : -12)}px; top:-24px`);
		}
		// Add this listener, and do not remove it (because it needs to constantly override Twine 2 where necessary until this CodeMirror panel is disposed of.
		cmElem.addEventListener('keydown', twine2KeymapOverride);
	}

	/*
		Help tooltips are the normal "tip" variety of tooltip.
		They can be toggled on and off via the toolbar.
	*/
	function makeHelpTooltip(path, cursor, cm) {
		/*
			Don't display the help tooltip at all under these circumstances.
		*/
		if ((cm.display.wrapper.classList.contains('harlowe-3-hideHelpTooltip')) || cm.doc.somethingSelected()) {
			return false;
		}

		const [token] = path;
		let message = tooltipMessages[token.type];
		if (typeof message === 'function') {
			message = message(token, path);
		}
		if (!message) {
			return false;
		}
		message = message.replace(/`([^`]+)`/g, (_, inner) => `<code>${inner}</code>`);

		tooltipElem.innerHTML = message
			+ (tooltipToggleHints > 0 ? (tooltipToggleHints--, `<br><br><i>Use the ${(document.querySelector(`[aria-label^="Coding tooltips"],[title^="Coding tooltips"]`) || {}).innerHTML || 'tooltip'} toolbar button to toggle these popups!</i>`) : '')
			+ "<div class=harlowe-3-tooltipTail>";

		tooltipElem.className = 'harlowe-3-tooltip harlowe-3-helpTooltip';
		positionTooltip(cm, cursor, true);
		// The help tooltip is hidden initially, but appears after a delay.
		tooltipElem.style.display = "none";
		tooltipAppearDelay = 50;
		return true;
	}

	/*
		Completion tooltips are a special kind of tooltip which:
		- appears to the right of the cursor (instead of centered under it)
		- offer completions for the currently-typed term
		- add a special keymap allowing a completion to be selected.
	*/
	const macroCompletions = Object.values(ShortDefs?.Macro || {}).reduce((a,{name,returnType,aka}) => {
		return a.find(e => e.name === name) ? a : a.concat({name, returnType}).concat(aka.map(name => ({name, returnType})));
	}, []);

	function macroCompletion(doc, text, path) {
		/*
			Don't complete macros inside strings.
		*/
		if (path.some(t => t.type === "string")) {
			return;
		}
		let [,partial] = (/\(([\w_-]+)$/.exec(text) || []);
		if (!partial) {
			return;
		}
		const attemptedMacroName = insensitiveName(partial);
		const completions = macroCompletions.filter(({name}) => insensitiveName(name).startsWith(attemptedMacroName)).sort((a,b) => a.name.length - b.name.length);
		if (!completions.length) {
			return;
		}
		/*
			When a menu item is selected, this callback is called, given the current menu cursor position.
		*/
		tooltipMenuCallback = i => {
			doc.replaceRange(`(${completions[i].name}:)`,
				// The partial, captured above, doesn't include the opening (, so add 1 to this length.
				docCursorPlus(doc,-(partial.length+1)),
				doc.getCursor());
			// Place the cursor inside the macro call.
			doc.setCursor(docCursorPlus(doc,-1));
		};
		tooltipMenuCursor = 0;
		tooltipMenuLength = completions.length;
		return completions.map((e,i) => `<div class='cm-harlowe-3-macro cm-harlowe-3-root harlowe-3-tooltipItem${!i ? ' harlowe-3-tooltipItemSelected' : ''}'>(<span class="cm-harlowe-3-macroName-${e.returnType.toLowerCase()}">${e.name}</span>:)</div>`).join('');
	}

	/*
		Sadly, this needs to be manually updated whenever new keywords are added or changed...
	*/
	const keywordCompletions = [
		..."exit,exits,it,pos,time,turn,turns,visit,visits".split(',').map(name => ({name, type: 'identifier'})),
		..."where,when,each,via,making".split(',').map(name => ({name, type: 'lambda', label: 'lambda keyword'})),
		..."number,num,string,str,boolean,bool,array,datamap,dm,dataset,ds,command,changer,color,colour,gradient,lambda,macro,datatype,codehook".split(',').map(name => ({name, type: 'datatype'})),
		..."even,odd,integer,int,empty,whitespace,lowercase,uppercase,anycase,alphanumeric,alnum,digit,linebreak,newline,const,any".split(',').map(name => ({name, type: 'datatype', label: 'specific datatype'})),
		..."red,orange,yellow,lime,green,cyan,aqua,blue,navy,purple,fuchsia,magenta,white,gray,grey,black,transparent".split(',').map(name => ({name, type: 'colour'})),
		..."is,is not,contains,does not contain,is in,is not in,is a,is not a,matches,does not match,and,or,not".split(',').map(name => ({name, type:'boolean', label: 'boolean operator'})),
		..."to,into,bind,2bind,-type".split(',').map(name => ({name, type: 'operator'})),
		{name:'true', type: 'boolean'},{name:'false', type: 'boolean'},
	];

	function keywordCompletion(doc, text, path) {
		/*
			Don't complete keywords unless inside macros (but not inside strings!).
		*/
		const insideMacro = path.reduce((a,t) =>
			// Because paths are deepest-first, it is safe to quit the reduce() after the first macro, hook or string token is encountered.
			a === undefined ? t.type === "macro" ? true : (t.type === "hook" || t.type === "string") ? false : a : a,
			undefined
		);
		if (!insideMacro) {
			return;
		}
		let [,partial] = (/[^$\w?]([-2]?[a-zA-Z ]+)$/.exec(text) || []);
		if (!partial ||
				/*
					Do not provide the "-type" completion for "-", as it is used far more often than -type such that this completion would be distracting.
				*/
				partial === "-" ||
				/*
					Do not provide completion when the final character is whitespace.
				*/
				partial[partial.length-1].trim() === "") {
			return;
		}
		const attemptedKeyword = partial.trimLeft().toLowerCase();
		const completions = keywordCompletions.filter(({name}) => name.startsWith(attemptedKeyword)).sort((a,b) => a.name.length - b.name.length);
		if (!completions.length) {
			return;
		}
		/*
			When a menu item is selected, this callback is called, given the current menu cursor position.
		*/
		tooltipMenuCallback = i => {
			doc.replaceRange(completions[i].name, docCursorPlus(doc,-partial.length), doc.getCursor());
		};
		tooltipMenuCursor = 0;
		tooltipMenuLength = completions.length;
		return completions.map((e,i) => `<div style='display:flex;justify-content:space-between' class="harlowe-3-tooltipItem${!i ? ' harlowe-3-tooltipItemSelected' : ''}"><span class='cm-harlowe-3-${e.type} cm-harlowe-3-root'>${e.name}</span><i style="display:inline-block;margin-left:2em;">${e.label || e.type}</i></div>`).join('');
	}

	/*
		Basic tooltip menu handling - the cursor position is updated and the new element is selected.
	*/
	function updateTooltipMenuCursor(t) {
		tooltipMenuCursor = t;
		tooltipElem.querySelector(`.harlowe-3-tooltipItemSelected`)?.classList.remove('harlowe-3-tooltipItemSelected');
		const item = tooltipElem.querySelectorAll(`.harlowe-3-tooltipItem`)[t];
		if (item) {
			item.classList.add('harlowe-3-tooltipItemSelected');
			item.scrollIntoView({block:'center'});
		}
	}

	function makeCompletion(path, cursor, cm) {
		const root = path[path.length-1];
		const {doc} = cm;
		const text = root.text.slice(0, doc.indexFromPos(doc.getCursor()));

		/*
			Currently, only two completions are supported.
		*/
		const completionHTML = macroCompletion(doc, text,path) || keywordCompletion(doc, text, path);
		if (!completionHTML) {
			return;
		}
		tooltipElem.innerHTML = completionHTML;
		tooltipElem.className = 'harlowe-3-tooltip harlowe-3-completion';
		positionTooltip(cm, cursor, false);
		tooltipAppearDelay = 0;
		cm.addKeyMap(tooltipMenuKeymap);
		tooltipMenuCursor = 0;
		return true;
	}

	/*
		The main Tooltips function creates tooltips when called by the CodeMirror mode.
		docData is special data associated with the current doc (see mode.js)
	*/
	function Tooltips(doc, docData) {
		const {tree, lastAction} = docData;
		const {cm} = doc;
		tooltipClear();
		
		const cmElem = cm.display.wrapper;

		if (tooltipElem.parentNode !== cmElem) {
			cmElem.append(tooltipElem);
			/*
				If the tooltipElem is disconnected from the DOM,
				then so is the previous cmElem to which it was appended.
				.CodeMirror elements are destroyed by Twine 2.3, not detached.
				This means it is safe to attach the mousemove event to this cmElem.
			*/
			cmElem.addEventListener('mousemove', () => {
				/*
					Only reduce the dismiss ticker if the mouse is off the tooltip.
				*/
				if (tooltipElem.style.display !== "none" && !cmElem.querySelector('.harlowe-3-tooltip:hover')) {
					tooltipDismissTicker -= 1;
					if (tooltipDismissTicker <= 0) {
						tooltipClear();
					}
				}
				/*
					Also, increase the appear delay if it's still active.
					This prevents the tooltip from appearing during periods of high mouse movement,
					and thus being immediately dismissed.
				*/
				else if (tooltipAppearDelay > 0) {
					tooltipAppearDelay += 1;
				}
			});
		}
		const cursor = doc.getCursor();
		const path = tree.pathAt(Math.min(tree.text.length-1, doc.indexFromPos(cursor)));
		if (!path.length) {
			tooltipAppearDelay = 0;
			return;
		}
		const alreadyDelayed = tooltipAppearDelay > 0;
		/*
			Make one of the types of tooltips. If none is applicable (or the tooltip-making functions can't find a message to use), return early.
		*/
		if (!((lastAction === 'change' ? makeCompletion : makeHelpTooltip)(path, cursor, cm))) {
			return;
		}
		/*
			To avoid queueing the tooltipAppear function multiple times with requestAnimationFrame, only call it if
			the tooltip is not already delayed.
		*/
		if (!alreadyDelayed) {
			tooltipAppear();
		}

	}
	if (this && this.loaded) {
		this.modules.Tooltips = Tooltips;
	}
	else if (!this.window) {
		this.Tooltips = Tooltips;
	}
}.call(eval('this')));

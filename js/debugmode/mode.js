"use strict";
define('debugmode/mode', ['jquery', 'utils', 'utils/naturalsort', 'state', 'engine', 'internaltypes/varref', 'internaltypes/twineerror', 'utils/operationutils', 'utils/renderutils', 'passages', 'section', 'debugmode/panel', 'debugmode/highlight',  'utils/typecolours'],
($, Utils, NaturalSort, State, Engine, VarRef, TwineError, {objectName, isObject, toSource, typeID}, {dialog}, Passages, Section, Panel, Highlight, {CSS:syntaxCSS}) => { let DebugMode = (initialError, code) => {
	/*
		Debug Mode

		When you test a Harlowe story using the "Test Story" option, debug mode is enabled. This mode adds a pane to the bottom of
		the page, which contains a few tools to examine your story, the current state, and how the macros in the current passage are
		behaving.

		This module exports a single function which, when run, performs all of the Debug Mode setup. Additional calls simply
		cause debug mode to be re-enabled if it was disabled.
	*/
	const {escape,nth,debounce} = Utils;
	const root = $(document.documentElement);
	const Sort = NaturalSort();

	/*
		Collect the Debug Mode options for this story.
		The following are the defaults if no data is present.
	*/
	let debugOptions = {
		darkMode: true,
		fadePanel: true,
		evalReplay: true,
		// Width and panel height aren't specified until the resizer is first used.
		width: null,
		maxHeight: 400,
	};
	if (State.hasStorage) {
		try {
			const optionsJSON = localStorage.getItem("(Debug Options " + Utils.options.ifid + ")");
			optionsJSON && (debugOptions = JSON.parse(optionsJSON));
		}
		catch (e) {
			// Fail silently
		}
	}
	Panel.defaultMaxHeight = debugOptions.maxHeight;
	function saveDebugModeOptions() {
		if (State.hasStorage) {
			try {
				localStorage.setItem("(Debug Options " + Utils.options.ifid + ")", JSON.stringify(debugOptions));
			}
			catch (e) {
				// Fail silently
			}
		}
	}

	let debugElement = $(`<tw-debugger class="${
		[
			debugOptions.darkMode ? 'theme-dark' : '',
			debugOptions.fadePanel ? 'fade-panel' : '',
		].join(' ')
	}" style="${
		debugOptions.width ? "width:" + debugOptions.width + "px" : ''
	}">
<div class='panel panel-errors' hidden><table></table></div>
<div class='tabs'></div>
<label style='user-select:none'>Turns: </label><select class='turns' disabled></select>
<button class='show-invisibles'>🔍 Debug View</button>
<button class='show-dom'><span style="vertical-align:text-top">&lt;</span><span style="vertical-align:text-bottom">&gt;</span> DOM View</button>
<button class='close'>✖</button>
<div class='resizer-h'>
</tw-debugger>`);
	const debugTabs = debugElement.find('.tabs');
	const showDOM = debugElement.find('.show-dom');
	const showInvisibles = debugElement.find('.show-invisibles');
	const closeButton = debugElement.find('.close');
	const turnsDropdown = debugElement.find('.turns');

	/*
		Every updater callback in this module should be disabled if debug mode has been disabled.
	*/
	const updater = fn => debounce(function() {
		if (!Utils.options.debug) {
			return;
		}
		return fn.apply(this,arguments);
	},
	// Throttle, don't fully debounce
	{maxWait:2000});

	/*
		Set up the Debug Eval Replay.
	*/
	function evalReplay(replay) {
		let ind = 0;
		const dialogElem = dialog({ buttons: [{name:"Understood", confirm:true, callback: () => !debugElement.find('tw-backdrop').length && debugElement.removeClass('show-dialog')}]})
			// Make the backdrop immune to the "peek behind dialogs" debug tool.
			.addClass('eval-replay');
		const replayEl = $(`<tw-eval-replay>${
				replay.length === 1 ? '' : `<tw-eval-code></tw-eval-code>`
			}<tw-eval-explanation></tw-eval-explanation><tw-eval-it></tw-eval-it><tw-eval-reason></tw-eval-reason>${
				replay.length === 1 ? '' : `<tw-dialog-links><tw-link style='visibility:hidden'>← 10</tw-link><tw-link style='visibility:hidden'>← ←</tw-link><b></b><tw-link>→ →</tw-link><tw-link>10 →</tw-link></tw-dialog-links>`
			}</tw-eval-replay>`);
		dialogElem.find('tw-dialog').css({width:'75vw','max-width':'75vw'}).prepend(replayEl);
		const left10 = replayEl.find('tw-link:first-of-type');
		const left = left10.next();
		const center = left.next();
		const right = center.next();
		const right10 = right.next();
		function doReplay() {
			/*
				Get the current frame of the replay, which is an object with { code, start, end, diff, desc, error, lambda } properties.
				The first one also has { basis }.
			*/
			const f = replay[ind];
			/*
				Do some simple jQuery permutation to display the current frame.
			*/
			const explanation = replayEl.find('tw-eval-explanation').empty();
			const code = replayEl.find('tw-eval-code');

			if (f.toCode || f.toDesc || f.error || f.lambda) {
				replayEl.find('tw-eval-code').empty().append(Highlight(f.code, 'macro', ind > 0 && f.start, ind > 0 && (f.end + f.diff)));
				explanation.append(
					/*
						Every frame except for a lambda frame has a "From" code block in the explanation.
					*/
					!f.lambda ? `<code class='${f.fromCode.length > 56 ? 'from-block' : 'from-inline'}'></code>` : '',
					/*
						What lies to the right (or for lambda frames, the centre) depends on the type of frame.
					*/
					f.error ? `<span> caused an error: </span>`
						: f.lambda ? `<span>The lambda <code class='to-lambda'></code> was run, producing these results.</span>`
						: `<span> became${f.ToDesc ? "…" : ''} </span>${!f.toDesc ? `<code class='to-code'></code>` : `<span class='to-desc'>${escape(f.toDesc)}.</span>`}`
				);
				if (f.error) {
					explanation.append(f.error);
				} else if (f.lambda) {
					const codeCell = (tag, code) => $(`<${tag}><code></${tag}>`).find('code').append(Highlight(code, 'macro')).end();

					explanation.find('.to-lambda').append(
						Highlight(f.lambda.obj.source, 'macro')
					).end().append(
						$('<table>').append(
							$('<tr>').append(
								codeCell('th', 'pos'),
								f.lambda.obj.loop ? codeCell('th',  "_" + f.lambda.obj.loop.getName()).append(' / ', $('<code>').append(Highlight('it', 'macro'))) : codeCell('th','it'),
								f.lambda.obj.making && codeCell('th', "_" + f.lambda.obj.making.getName()),
								f.lambda.obj.where && codeCell('th', 'where').append(' result'),
								f.lambda.obj.via && codeCell('th', 'via').append(' result'),
							),
							...f.lambda.loops.map(({ it, pos, making, whereResult, whereReplay, viaResult, viaReplay, }) =>
								$('<tr>').append(
									codeCell('td', toSource(pos)),
									codeCell('td', toSource(it)),
									making !== undefined && codeCell('td', toSource(making)),

									whereResult !== undefined && whereResult !== null &&
										(TwineError.containsError(whereResult) ? $('<td>').append(whereResult.render(f.lambda.obj.source, /*NoEvents*/ true))
											: codeCell('td', toSource(whereResult))
										).append(
											whereReplay && $("<tw-open-button replay label='🔍'>").data('evalReplay', whereReplay)
										),
									viaResult !== undefined && viaResult !== null &&
										(TwineError.containsError(viaResult) ? $('<td>').append(viaResult.render(f.lambda.obj.source, /*NoEvents*/ true))
											: codeCell('td', toSource(viaResult))
										).append(
											viaReplay && $("<tw-open-button replay label='🔍'>").data('evalReplay', viaReplay)
										),
								)
							)
						),
					);
				} else if (!f.toDesc) {
					explanation.find('.to-code').append(Highlight(f.toCode, 'macro'));
				}
				// Populate <tw-eval-it> and <tw-eval-reason>
				explanation
					.next().html(f.itIdentifier ? `(The <code class="cm-harlowe-3-identifier">it</code> identifier now refers to ${escape(f.itIdentifier)}.)` : '')
					.next().text(f.reason || '');
			}
			else {
				code.html(Highlight(f.code, 'macro'));
				explanation.html(`<center>First, there was <code></code>.</center>`)
					// Empty <tw-eval-it> and <tw-eval-reason>
					.next().empty().next().empty();
			}
			!f.lambda && explanation.find('code').first().append(Highlight(f.fromCode, 'macro'));

			replayEl.find('mark').each((_,e) => { e.scrollIntoView(); });
			left10.css('visibility', ind <= 9 ? 'hidden' : 'visible');
			left.css('visibility', ind <= 0 ? 'hidden' : 'visible');
			right.css('visibility', ind >= replay.length-1 ? 'hidden' : 'visible');
			right10.css('visibility', ind >= replay.length-10 ? 'hidden' : 'visible');
			center.html(`( ${ind+1}/${replay.length} )`);
		}
		doReplay();
		left10.on('click', () => { ind = Math.max(0,ind-10); doReplay(); });
		left.on('click', () => { ind = Math.max(0,ind-1); doReplay(); });
		right.on('click', () => { ind = Math.min(replay.length-1,ind+1); doReplay(); });
		right10.on('click', () => { ind = Math.min(replay.length-1,ind+10); doReplay(); });
		/*
			This check means that inner errors' dialogs cover the current dialog.
			All dialogs must cover the debug panel, though.
		*/
		if (debugElement.find('tw-backdrop').length) {
			debugElement.find('tw-backdrop').before(dialogElem);
		} else {
			debugElement.addClass('show-dialog').append(dialogElem);
		}
	}
	/*
		This is the event for the buttons that show Debug Replays (or are (goto:)s that were delayed by debug tools).
		<tw-eval-explanation> refers to lambda result cells, which have sub-replays that can be viewed.
	*/
	$(document.documentElement).on('click', 'tw-expression, tw-error, tw-eval-explanation', debounce((e) => {
		const replay = $(e.target).data('evalReplay');
		if (replay) {
			evalReplay(replay);
		}
		const goto = $(e.target).data('goto');
		if (goto) {
			/*
				For succinctness in code, the tool is simply momentarily turned off in time to run the command.
			*/
			let cache = Utils.options.ignoreGotos;
			Utils.options.ignoreGotos = false;
			goto.command.TwineScript_Run(goto.section);
			Utils.options.ignoreGotos = cache;
		}
		e.stopPropagation();
	}));
	/*
		Set up the resizer areas.
	*/
	debugElement.find('.resizer-h').mousedown(e => {
		// It must be the left mouse button.
		if (e.which !== 1) {
			return true;
		}
		e.stopPropagation();
		const { pageX:oldPageX } = e;
		const oldWidth = debugElement.width();
		root.on('mousemove.debugger-resizer-h', ({pageX}) => {
			debugElement.width(`${oldWidth + oldPageX - pageX|0}px`);
		})
		.on('mouseup.debugger-resizer-h', () => {
			root.off('.debugger-resizer-h');
			debugOptions.width = debugElement.width();
			saveDebugModeOptions();
		});
	});
	debugElement.on('mousedown', '.resizer-v', e => {
		// It must be the left mouse button.
		if (e.which !== 1) {
			return true;
		}
		e.stopPropagation();
		const { pageY:oldPageY } = e;
		const oldHeight = $(e.target.parentNode).height();
		root.on('mousemove.debugger-resizer-v', ({pageY}) => {
			debugElement.find('.panel').css('maxHeight',`${oldHeight + oldPageY - (pageY|0)}px`);
		})
		.on('mouseup.debugger-resizer-v', () => {
			root.off('.debugger-resizer-v');
			debugOptions.maxHeight = debugElement.find('.panel').css('maxHeight');
			saveDebugModeOptions();
		});
	});
	/*
		Set up the "Debug View" button, which toggles debug mode CSS (showing <tw-expression> elements and such)
		when clicked. It uses the class 'debug-mode' on <tw-story> to reveal it.
	*/
	showInvisibles.click(() => {
		root.toggleClass('debug-mode').removeClass('dom-debug-mode');
		showInvisibles.toggleClass('enabled');
		showDOM.removeClass('enabled');
	});
	/*
		Set up the "DOM View" button, which is mutually exclusive with the Debug View.
	*/
	showDOM.click(() => {
		root.toggleClass('dom-debug-mode').removeClass('debug-mode');
		showDOM.toggleClass('enabled');
		showInvisibles.removeClass('enabled');
	});
	/*
		Set up the close button.
	*/
	closeButton.click(() => {
		root.removeClass('debug-mode dom-debug-mode');
		debugElement.detach();
		/*
			Reset all of the debug Tools panel's adjustments.
			TODO: Maybe this should be a Utils method??
		*/
		Object.assign(Utils.options, {
			debug: false, speedMultiplier: 1, ignoreClickEvents: false, ignoreGotos: false,
		});
	});

	/*
		Set up the
		----------
		Turns dropdown
		----------
		which provides a menu of turns in the state and permits the user
		to travel to any of them at will.
	*/
	const updateTurnsDropdown = updater(function() {
		const children = turnsDropdown.children().get();
		const { timeline } = State;
		/*
			This number reflects the actual turn number, which includes turns erased by (forget-undos:).
		*/
		let num = 0;
		timeline.forEach(({turns = 0, passage}, i) => {
			num += 1 + turns;
			const dropdownLabel = num + ": " + passage;
			if (children[i]) {
				children[i].textContent = dropdownLabel;
			} else {
				turnsDropdown.append(`<option value='${i}'>${dropdownLabel}</option>`);
			}
		});
		/*
			If something (such as (forget-undos:), or erasing the future by advancing from a past turn)
			reduces the timeline length from what it once was, remove those unneeded <option>s.
		*/
		if (timeline.length < children.length) {
			$(children.slice(timeline.length)).remove();
		}
		/*
			The turns dropdown should be disabled only if one or fewer turns are
			in the State history.
		*/
		turnsDropdown[timeline.length >= 1 ? 'removeAttr' : 'attr']('disabled');

		/* Update the dropdown to match the current passage */
		turnsDropdown.val(State.pastLength);
	});
	turnsDropdown.change(({target:{value}}) => {
		/*
			Work out whether to travel back or forward by subtracting the
			value from the current State moment index.
		*/
		const travel = value - State.pastLength;
		if (travel !== 0) {
			State[travel < 0 ? "rewind" : "fastForward"](Math.abs(travel));
			Engine.showPassage(State.passage);
		}
	});
	/*
		Add the dropdown entries if debug mode was enabled partway through the story.
	*/
	updateTurnsDropdown();
	/*
		In order for the turnsDropdown view to reflect the state data, these event handlers
		must be installed on State, to be called whenever the current moment changes.

		Most events simply trigger an update of the dropdown.
	*/
	State.on('forward', updateTurnsDropdown)
		.on('load', updateTurnsDropdown)
		.on('forgetUndos', () => updateTurnsDropdown)
		/*
			'back', however, can simply remove the final turn from the menu.
		*/
		.on('back', () => {
			/*
				As above, disable if only one turn remains in the timeline.
			*/
			if (State.pastLength <= 1) {
				turnsDropdown.attr('disabled');
			}
			/*
				Deselect the current selected <option>.
			*/
			turnsDropdown.find('[selected]').removeAttr('selected');
			/*
				Select the new last element.
			*/
			turnsDropdown.val(State.pastLength);
		});

	/*
		This event is used for the (source:) fold-downs in the Variables and Enchantments panels.
	*/
	const folddownEvent = target => {
		const row = target.parents('.variable-row, .enchantment-row, .source-row');
		row.next('.panel-row-source').find('td').empty().append(Highlight(
			row.data('value')
				/*
					The Enchantments panel stashes its data a little differently to the Variables panel.
				*/
				|| toSource(row.data('enchantment').changer),
			/*
				The Source panel displays markup source, not individual values.
			*/
			row.is('source-row') ? 'markup' : 'macro'
		));
	};
	/*
		Set up the
		----------
		Variables
		---------
		panel.
		Temp variables in single passages are stored in the following Set, which is cleared
		whenever passage navigation occurs, reflecting temp variables' actual semantics.
	*/
	let localTempVariables = new Set();
	const Variables = Panel.create({
		className: "variables", tabName: "Variable",
		rowWrite({name, dataset, path, value, tempScope, type}, row) {
			/*
				The debug name used defers to the TwineScript_DebugName if it exists,
				and falls back to the objectName if not. Note that the TwineScript_DebugName can contain HTML structures
				(such as a <tw-colour> for colours) but the objectName could contain user-inputted data, so only the latter is escaped.
			*/
			const tooLong = value && value.length > 48 && !value.TwineScript_DebugName;
			const val = isObject(value) && value.TwineScript_DebugName ? value.TwineScript_DebugName() : escape(objectName(value));
			/*
				Single variables, like $peas, should be displayed with no trail, as "peas".
				Deep object properties, like $arr's 1st's 1st, should be displayed with a trail
				consisting of "arr's 1st's", and the name changed to "1st".
				(Note that the prefix of $ or _ is added using CSS ::before.)
			*/
			let trail = '';
			if (path.length) {
				trail = path.reduce((a,e) => a + e + "'s ", '');
			}
			/*
				Dataset entries, which use Numbers as names instead of user-facing strings, should be converted to "???".
			*/
			if (dataset) {
				name = "???";
			}
			/*
				Typed variables should have their type restriction listed.
			*/
			const typeName = type ? toSource(type) : '';
			/*
				Source code for objects can be viewed with a folddown button.
			*/
			const folddown = typeof value === "object" || tooLong;
			/*
				Freshen up the passed-in row if given.
			*/
			if (row) {
				/*
					This assumes .variable-type is the first child!!
				*/
				row[0].firstChild.innerHTML = (typeName || '');
				if (trail) {
					$(row[0].firstChild).children('.variable-path').html((tempScope ? "_" : "$") + escape(trail));
				}
				/*
					Replace the final text node in .variable-name
					This assumes .variable-name is the second child!!
				*/
				row[0].childNodes[1].lastChild.textContent = (!trail ? (tempScope ? "_" : "$") : '') + escape(name + '');
				/*
					This assumes .temporary-variable-scope is the third child!!
				*/
				row[0].childNodes[2].textContent = (tempScope || '');
				/*
					This assumes .variable-value is the fourth child!!
				*/
				row[0].childNodes[3].innerHTML = val;
				/*
					This assumes .panel-row-buttons is the last child!!
				*/
				const folddownButton = $(row[0].lastChild.firstChild);
				const alreadyOpen = folddownButton.is('.open');
				folddownButton[folddown ? 'show' : 'hide']();
				const source = row.next('.panel-row-source');
				/*
					 Note: .is(":visible") can't be used here due to visiblity lookups causing massive slowdown.
				*/
				if (alreadyOpen) {
					source.find('td').empty().append(Highlight(toSource(value)));
				}
				row.data('value', toSource(value));
				/*
					So that the .panel-row-source isn't considered unused and deleted, return it as well in the jQuery.
				*/
				return row.add(source);
			}
			/*
				Create the <span>s for the variable's name and value.
			*/
			row = $('<div class="variable-row">')
				.attr('data-name', name).attr('data-path', path+'').attr('data-scope', tempScope || '')
				/*
					Data structure entries are indented by their depth in the structure, to a maximum of 5 levels deep.
				*/
				.css('padding-left', Math.min(5,path.length)+'em')
				.append(
					// Variable type
					`<td class='variable-type'>${typeName || ''}</td>`,
					// Variable name
					"<td class='variable-name cm-harlowe-3-" + (tempScope ? "tempV" : "v") + "ariable'><span class='variable-path'>"
						+ (trail ? (tempScope ? "_" : "$") + escape(trail) : '') + "</span> "
						+ (!trail ? (tempScope ? "_" : "$") : '') + escape(name + '') + "</td>",
					// Variable Scope
					`<td class='temporary-variable-scope'>${tempScope || ''}</td>`,
					// Value
					// This re-uses the macroname type colouring CSS classes.
					"<td class='variable-value cm-harlowe-3-macroName-" + typeID(value) + "'>" + val + "</td><td class='panel-row-buttons'>"
						+ "<tw-folddown tabindex=0 style='display:" + (folddown ? "visible" : 'none') + "'>(source:) </tw-folddown>"
					+ "</td>"
				)
				/*
					The value's source is stashed as data, so that the folddownEvent can access it.
				*/
				.data('value', toSource(value))
				/*
					And here, the folddown event is installed.
				*/
				.find('tw-folddown').data('folddown', folddownEvent).end()
				/*
					And the source panel that gets folded down is installed here.
				*/
				.add(
					/*
						Only uses <tr> because:
						A. it doesn't disrupt the :nth-of-type() styling used for variable rows.
						B. it needs to hold a <td> with colspan, whose effect isn't available to CSS.
					*/
					"<tr class='variable-row panel-row-source' style='display:none'><td colspan='5'></td></tr>"
				);
			return row;
		},
		rowCheck({name, path, tempScope}, row) {
			/*
				 For performance reasons, .getAttribute is used here instead of .attr()
			*/
			return row[0] && row[0].getAttribute('data-name') === name && row[0].getAttribute('data-path') === (path+'') && row[0].getAttribute('data-scope') === tempScope;
		},
		columnHead() {
			return `<tr class="panel-head"><th data-col="variable-type">Type</th><th data-col="variable-name">Name</th><th data-col="temporary-variable-scope">Scope</th><th data-col="variable-value">Value</th></tr>`;
		},
		rowSort(column, a,b) {
			if (column === "variable-value") {
				/*
					Values are sorted first by their type (determined in a somewhat crude fashion from their syntax highlighting CSS class)
					followed by their Harlowe source.
				*/
				return Sort(a.attr('class'), b.attr('class')) || Sort(a.parent().data('value'), b.parent().data('value'));
			}
		},
	});

	/*
		This event handler updates variables whenever the state is changed. Each row of data is either a global
		variable, or a temp variable stored in the localTempVariables set, above.
	*/
	const updateVariables = updater(function() {
		const rows = [];
		const globals = State.variables;
		let count = rows.length;
		/*
			The following recursive function adds entries for each value inside arrays, maps, and sets.
		*/
		function recursiveUpdateVariables(row) {
			/*
				Just in case, here's a crude emergency exit.
			*/
			if (rows.length > 500) {
				return;
			}
			rows.push(row);
			const path = row.path.concat(row.name);
			const {value, tempScope} = row;
			// Maximum depth of recursive data structure entries is 4.
			if (path.length <= 4) {
				if (Array.isArray(value)) {
					value.forEach((elem,i) =>
						recursiveUpdateVariables({name: nth(i+1), path, value:elem, tempScope})
					);
				}
				else if (value instanceof Map) {
					[...value].forEach(([key,elem]) =>
						recursiveUpdateVariables({name:key, path, value:elem, tempScope})
					);
				}
				else if (value instanceof Set) {
					/*
						Sets don't have keys. So, using "???" for every entry is what we're forced to do
						to keep this display consistent with the others.
					*/
					[...value].forEach((elem,i) =>
						recursiveUpdateVariables({name: i, dataset:true, path, value:elem, tempScope})
					);
				}
			}
		}
		for (let name in globals) {
			if (!name.startsWith('TwineScript')) {
				count += 1;
				recursiveUpdateVariables({name, path:[], value:globals[name], tempScope:'',
					type: globals.TwineScript_TypeDefs?.[name]
				});
			}
		}
		/*
			The order of variables is: global, then temp.
		*/
		rows.push(...localTempVariables);
		count += localTempVariables.size;
		Variables.update(rows, count);
		/*
			The following lines are exclusively for the benefit of the documentation's live code preview
			pane, which displays variables but nothing else.
		*/
		if ((count === 0) !== Variables.panel[0].classList.contains("panel-variables-empty")) {
			Variables.panel.toggleClass('panel-variables-empty');
		}
	});
	/*
		This is defined far below.
	*/
	let updateStorylets;

	VarRef.on('set', (obj, name, value) => {
		/*
			For a deep data structure (set:), VarRef.on will fire "set" callbacks for every object in the
			chain: $a's b's c's d to 1 will produce 'set' callbacks for c, b, a and State.variables.
			We only care about the root variable store.
		*/
		/*
			Since temp variables' variable stores are tied to sections and can't be easily accessed
			from here, add their variable rows on each set() rather than getting updateVariables() to do it.
		*/
		if (obj !== State.variables && obj.TwineScript_VariableStore?.type === 'temp' &&
				/*
					Custom macro variables are prohibited from appearing in the Variables panel.
					TODO: Replace this with a more robust check.
				*/
				!obj.TwineScript_VariableStore?.name.match(/#\d+$/)
			) {
			const tempScope = obj.TwineScript_VariableStore?.name;
			const type = obj.TwineScript_TypeDefs?.[name];
			/*
				If a local variable was altered rather than added, then simply update its value.
			*/
			const row = [...localTempVariables].find(row => row.name === name && row.tempScope === tempScope);
			if (!row) {
				localTempVariables.add({name, path:[], value, tempScope, type});
			}
			else {
				row.value = value;
			}
		}
		updateVariables();
		updateStorylets();
	})
	.on('delete', () => {
		updateVariables();
		updateStorylets();
	});

	Variables.panel.append(
		`<div class='panel-variables-bottom'>
			<button class='panel-variables-copy'>Copy $ variables as (set:) call</button>
			<input class='clipboard' type="text" style='opacity:0;pointer-events:none;position:absolute;'></input>
		</div>`
	)
	/*
		The Variables panel is visible initially.
	*/
	.removeAttr('hidden');
	Variables.tab.addClass('enabled');

	/*
		Set up the "Copy all as (set:)" button.
	*/
	const inputElem = Variables.panel.find('.clipboard');
	root.on('click', '.panel-variables-copy', () => {
		let variableToValue = [];
		for (let name in State.variables) {
			if (!name.startsWith('TwineScript')) {
				variableToValue.push(
					"$" + name + " to " + toSource(State.variables[name])
				);
			}
		}
		inputElem.val("(set:" + variableToValue + ")")[0].select();
		document.execCommand('copy');
	});

	/*
		Set up the
		-------------
		Enchantments
		-------------
		panel. Enchantments can, irksomely, be added and removed at arbitrary times. However,
		they are fairly simple to fully describe - they have just a scope, and either a changer
		(for (enchant:)) or a name (for (click:) etc.).
	*/
	const Enchantments = Panel.create({
		className: "enchantments", tabName: "Enchantment",
		rowWrite(enchantment, row) {
			const {scope, changer, lambda, name, localHook} = enchantment;
			let val;
			if (changer) {
				val = escape(objectName(changer));
			}
			else if (lambda) {
				val = escape(toSource(lambda));
			}
			else {
				val = "<em>enchanted with (" + name + ":)</em>";
			}
			/*
				Enchantment rows never need to be freshened up because rowCheck() compares
				the exact enchantment object, from which all the values are derived.
			*/
			if (row) {
				return row;
			}
			/*
				Create the <span>s for the variable's name and value.
			*/
			return $('<div class="enchantment-row">')
				.data('enchantment', enchantment)
				.append(
					"<td><span class='enchantment-name'>" + toSource(scope)
					+ (localHook ? "</span><span class='enchantment-local cm-harlowe-3-hookName'>"
						/*
							localHooks can be jQuerys (for plain attachment) or HookSets (for use in (enchant:)).
						*/
						+ (typeof localHook.TwineScript_ToSource === "function" ? localHook.TwineScript_ToSource() :
							localHook.attr('name') ? "?" + localHook.attr('name') : "an unnamed hook") : "")
						+ "</span>"
					+ "</td><td class='enchantment-value cm-harlowe-3-macroName-" + (changer ? "changer" : "command") + " '>"
					+ val + "</td>"
					+ (changer ? "<td class='panel-row-buttons'>"
						+ "<tw-folddown tabindex=0>(source:)</tw-folddown>"
						+ "</td>"
					: "")
				)
				.find('tw-folddown').data('folddown', folddownEvent).end()
				.add(
					changer ? $("<tr class='panel-row-source' style='display:none'><td colspan='3'></td></tr>") : ''
				);
		},
		rowCheck(enchantment, row) {
			return row.data('enchantment') === enchantment;
		},
		columnHead() {
			return `<tr class="panel-head"><th data-col="enchantment-name">Scope</th><th data-col="enchantment-value">Value</th></div>`;
		},
	});
	const updateEnchantments = updater((section) => {
		Enchantments.update(section.enchantments, section.enchantments.length);
	});
	Section.on('add', updateEnchantments).on('remove', updateEnchantments);

	/*
		Set up the 
		----------
		Storylets
		---------
		panel.
		The number of possible storylets in a story is fixed at startup. Active storylets
		are determined by running their lambdas whenever State changes, using the following blank Section.
	*/
	const storyletSection = Section.create();
	const Storylets = Panel.create({
		className: "storylets", tabName: "Storylet",
		rowWrite({name, active, storyletSource, exclusive, urgent}, row) {
			if (row) {
				/*
					Only the active/inactive state needs to be updated.
				*/
				row.toggleClass('storylet-closed', !active);
				/*
					This assumes .storylet-open is the first element child!!
				*/
				row[0].firstChild.textContent = (active ? '✓' : '');
				return row;
			}
			const ret = $(`<tr class="storylet-row ${!active ? 'storylet-closed' : ''}">`)
				.attr('data-name', name)
				/*
					Create the <span>s for the storylet's name and lambda.
				*/
				.append(
					"<td class='storylet-open'>" + (active ? '✓' : '')
					+ "</td><td class='storylet-name'>" + name
					+ "</td><td class='storylet-lambda'>"
					+ "</td><td class='storylet-exclusive'>" + exclusive
					+ "</td><td class='storylet-urgent'>" + urgent + "</td>"
				);
			ret.find('.storylet-lambda').append(Highlight(storyletSource.replace(/^when\s+/i,'')));
			return ret;
		},
		rowCheck({name}, row) {
			return row[0].getAttribute('data-name') === escape(name + '');
		},
		columnHead() {
			return `<tr class="panel-head"><th data-col="storylet-open" data-order="desc">Open</th><th data-col="storylet-name">Name</th><th data-col="storylet-lambda">Condition</th><th data-col="storylet-exclusive" class='storylet-exclusive'>Exclusivity</th><th data-col="storylet-urgent" class='storylet-urgent'>Urgency</th></tr>`;
		},
	});
	/*
		The Storylets tab is hidden if there are no Storylets.
	*/
	Storylets.tab.hide();
	updateStorylets = updater(() => {
		const activeStorylets = Passages.getStorylets(storyletSection);
		const error = (TwineError.containsError(activeStorylets));
		const allStorylets = Passages.allStorylets();
		let anyExclusives, anyUrgents;
		Storylets.update(allStorylets.map(e => {
			const exclusive = typeof e.get('exclusivity') === "number" ? e.get('exclusivity') : 0;
			const urgent = typeof e.get('urgency') === "number" ? e.get('urgency') : 0;
			anyExclusives = anyExclusives || exclusive;
			anyUrgents = anyUrgents || exclusive;
			return {
				name: e.get('name'),
				storyletSource: e.get('storylet').TwineScript_ToSource(),
				active: !error && activeStorylets.some(map => map.get('name') === e.get('name')),
				exclusive, urgent,
			};
		}), error ? 0 : activeStorylets.length);
		/*
			If the list was indeed an error, simply close and mark every storylet row,
			because storylet-listing macros currently won't work.
		*/
		Storylets.panel.toggleClass('storylet-error', error);
		/*
			Hide the "exclusive" or "urgent" columns if all of the values are 0 or a non-number.
		*/
		Storylets.panel.toggleClass('panel-exclusive', anyExclusives);
		Storylets.panel.toggleClass('panel-urgent', anyUrgents);
		/*
			Reveal the Storylets tab if there are storylets.
		*/
		if (allStorylets.length) {
			Storylets.tab.show();
		}
	});
	/* The above function is called by VarRef.on('set') earlier. */

	/*
		Set up the
		------
		Source
		------
		panel. This simply holds one "row" that's manually updated without using the same Panel
		update -> rowCheck -> rowWrite lifecycle as the other panels.
	*/
	const Source = Panel.create({
		className: "source", tabName: "Source", tabNameCounter: false,
		rowWrite({name, tag}, row) {
			if (row) {
				return row.add(row.next('.panel-row-source'));
			}
			const source = Passages.get(name).get('source');
			return $(`<div class="source-row" data-tag="${tag}">`)
				/*
					Don't make the mistake of wrapping toSource() around what is already source.
				*/
				.data('value', source)
				.append(`<td class="source-name">${name}</td><td class="source-tags">${tag}</td><td class='panel-row-buttons'><tw-folddown class='${!tag ? 'open' : ''}' tabindex=0></tw-folddown></td>`)
				.find('tw-folddown').data('folddown', folddownEvent).end()
				.add(
					$(`<tr class='panel-row-source' style='${!tag ? '' : 'display:none'}'><td colspan='3'></td></tr>`)
						.find('td').append(!tag && Highlight(source, 'markup')).end()
				);
		},
		rowCheck({name}, row) {
			/*
				This assumes the first child is .source-name!!
			*/
			return row[0].firstChild.textContent === escape(name + '');
		},
		tabUpdate: $.noop,
		columnHead: $.noop,
	});
	/*
		Because setup passages are fixed for the duration of a session, these rows only need to be computed once.
	*/
	const sourceData = (['debug-startup','startup','header','debug-header','footer','debug-footer'].reduce(
		(a,tag) => a.concat(Passages.getTagged(tag).map(p => ({ name: p.get('name'), tag }))),
		[]
	));

	/*
		Set up the
		------
		Errors
		------
		panel. Again, this doesn't use the same lifecycle as the other panels, but it does have
		multiple rows, which are still inserted manually.
	*/
	const Errors = Panel.create({
		className: "errors", tabName: "Error",
		rowWrite: $.noop,
		rowCheck: $.noop,
		columnHead: $.noop,
		tabUpdate: count =>
			Errors.tab.css({ background: count ? 'rgba(230,101,204,0.3)' : '' })
				.text(`${count} Error${count !== 1 ? 's' : ''}`),
	});
	const onError = debounce((batch) => {
		if (!Utils.options.debug) {
			return;
		}
		Errors.panelRows.append(batch.reduce((a, [error, code]) => {
			/*
				Do NOT put it in the error console if it's a propagated error.
			*/
			if (error.type === "propagated") {
				return a;
			}
			return a + '<tr class="error-row">'
				+ '<td class="error-passage">' + State.passage + '</td>'
				+ '<td class="error-message" title="' + escape(code) + '">' + error.message + '</td>'
				+ '</tr>';
		}, ''));
		/*
			Emergency: if 500+ errors are present in the table, remove the top ones so that the error DOM
			doesn't become too overloaded.
		*/
		const c = Errors.panelRows.children();
		const errorLength = c.length;
		if (errorLength > 500) {
			$(Array.prototype.slice.call(Errors.panelRows[0].childNodes, 0, errorLength - 500)).remove();
		}
		Errors.tabUpdate(Math.min(500,c.length));
	}, {batch: true});
	TwineError.on(onError);

	/*
		Set up the "Clear this panel" button.
	*/
	Errors.panel.append(
		`<div class='panel-errors-bottom'>
			<button class='panel-errors-clean'>🧹 Clear this panel</button>
		</div>`
	);
	root.on('click', '.panel-errors-clean', () => {
		Errors.panelRows.empty();
		Errors.tabUpdate(0);
	});

	/*
		Set up the
		------
		Tools
		------
		panel. This provides special debugging tools.
	*/
	const Tools = Panel.create({
		className: "tools", tabName: "Tools", tabNameCounter: false,
		rowWrite: ({id, type, label, dropdownItems, dropdownValue}, row) => {
			if (type === 'checkbox') {
				if (row) {
					return row.find('input').prop('checked', false);
				}
					return $(`<span><input id="debug-${id}" type="checkbox"></input><label for="debug-${id}">${label}</label></span>`);
				
			}
			if (type === 'dropdown') {
				if (row) {
					return row.find('input').prop('checked', false);
				}
				
					return $(`<span>${label}<select style="width:3em" data-default="${dropdownValue}" id="debug-${id}"></span>`).find('select').append(dropdownItems.map(e => `<option value='${e}' ${e === dropdownValue ? 'selected' : ''}>${e}x</option>`)).end();
				
			}
		},
		rowCheck: $.noop,
		columnHead: $.noop,
		tabUpdate: enabled => Tools.tab.css({ background: enabled ? 'hsla(210, 72%, 65%, .3)' : '' }),
	});
	root.on('click, change', '.panel-tools [type="checkbox"], .panel-tools select', ({target}) => {
		target = $(target);
		const id = target.attr('id'), enabled = target.is(':checked') || (target.is('select') && target.val() !== +target.attr('data-default'));
		if (id === "debug-peekBehindDialogs") {
			root.toggleClass('debug-dialogs', enabled);
		}
		if (id === "debug-ignoreClickEvents") {
			Utils.options.ignoreClickEvents = enabled;
		}
		if (id === "debug-ignoreGotos") {
			Utils.options.ignoreGotos = enabled;
		}
		if (id === "debug-speedMultiplier") {
			Utils.options.speedMultiplier = +target.val();
		}
		Tools.tabUpdate(enabled);
	});
	Tools.update([
		{id: "peekBehindDialogs", type: 'checkbox', label: "See through and click through <code>(dialog:)</code> boxes"},
		{id: "ignoreClickEvents", type: 'checkbox', label: "Stop links, <code>(click:)</code> and <code>(hover-style:)</code> from activating"},
		{id: "ignoreGotos", type: 'checkbox', label: "Stop <code>(go-to:)</code>, <code>(undo:)</code>, <code>(redirect:)</code> and <code>(restart:)</code> from activating<br><small>(Click 'GO' buttons in Debug View to activate later)</small>"},
		{id: "speedMultiplier", label: "Speed of timed events (<code>time</code>, <code>(live:)</code>, <code>(after:)</code>): ", type: 'dropdown', dropdownValue: 1, dropdownItems: [0.25,0.5,0.75,1,1.25,1.5,1.75,2,3,5,10]}
	]);

	/*
		Set up the
		------
		Options
		------
		panel. This holds debug mode options.
	*/
	const Options = Panel.create({
		className: "options", tabName: "⚙️", tabNameCounter: false,
		rowWrite: ({name, label}, row) => {
			const enabled = {
				darkMode:   debugOptions.darkMode,
				fadePanel: debugOptions.fadePanel,
				evalReplay: debugOptions.evalReplay,
			}[name];
			if (row) {
				return row.find('input').prop('checked', enabled);
			}
			return $(`<span><input id="debug-${name}" type="checkbox" ${enabled ? 'checked' : ''}></input><label for="debug-${name}">${label}</label></span>`);
		},
		rowCheck: $.noop,
		tabUpdate: $.noop,
		columnHead: $.noop,
	});
	root.on('click', '.panel-options [type="checkbox"]', ({target}) => {
		target = $(target);
		const id = target.attr('id'), enabled = target.is(':checked');
		if (id === "debug-darkMode") {
			debugOptions.darkMode = enabled;
			debugElement.toggleClass('theme-dark', enabled);
		}
		if (id === "debug-fadePanel") {
			debugOptions.fadePanel = enabled;
			debugElement.toggleClass('fade-panel', enabled);
		}
		if (id === "debug-evalReplay") {
			Utils.options.evalReplay = debugOptions.evalReplay = enabled;
		}
		saveDebugModeOptions();
	});
	Options.update([
		{name: "darkMode", label: "Debug panel is dark"},
		{name: "fadePanel", label: "Debug panel is transparent unless the cursor is over it"},
		{name: "evalReplay", label: "Record expression replays (viewable via 🔍 buttons in Debug View; slower)"}
	]);

	/*
		Place all the panel elements inside, in order.
	*/
	debugElement.prepend(Variables.panel, Enchantments.panel, Errors.panel, Storylets.panel, Source.panel, Tools.panel, Options.panel);
	debugTabs.prepend(Variables.tab, Enchantments.tab, Errors.tab, Storylets.tab, Source.tab, Tools.tab, Options.tab);

	/*
		Clearing the localTempVariables set must occur before executing the code of the new passage traveled to.
		Hence, this separate handler.
	*/
	const beforeChange = () => localTempVariables = new Set();
	State.on('beforeForward', beforeChange).on('beforeBack', beforeChange).on('beforeLoad', beforeChange);
	/*
		All this other UI updating stuff must occur after.
	*/
	const refresh = updater(function() {
		updateVariables();
		updateStorylets();
		Enchantments.panelRows.empty();
		Enchantments.tabUpdate(0);
		if (State.passage && Passages.get(State.passage)) {
			Source.update(sourceData.concat({name: State.passage, tag: ''}));
			/*
				Do a quick manual reordering. Only the single passage row needs to be moved.
			*/
			Source.panel.find('[data-tag=""], [data-tag=""] + .panel-row-source').insertBefore(Source.panel.find('[data-tag="footer"]').first());
		}
	});
	/*
		Having defined those functions, we register them as event handlers now.
	*/
	State.on('forward', refresh).on('back', refresh).on('load', refresh);

	const enableMode = () => {
		$(document.body).append(debugElement);
		Utils.options.debug = true;
		Utils.options.evalReplay = debugOptions.evalReplay;
		/*
			This shouldn't be necessary, but just in case...
		*/
		Utils.options.speedMultiplier = 1;
		Utils.options.ignoreClickEvents = false;
		Utils.options.ignoreGotos = false;
		refresh();
	};
	/*
		Because this first call adds a bunch of DOM elements and callbacks, it shouldn't run as-is when re-enabling Debug Mode.
		Subsequent calls simply re-enable debug mode.
	*/
	DebugMode = enableMode;
	/*
		Finally, append both the <tw-debugger> and the syntax highlighter CSS.
	*/
	$(document.head).append($('<style>').html(syntaxCSS));
	enableMode();
	
	/*
		If an error prompted Debug Mode to be enabled (i.e. before the OnError handler was installed),
		then we have to insert that error into the pane manually, and also refresh the other panes.
	*/
	if (initialError) {
		onError(initialError, code);
	}
};
/*
	Don't re-enable Debug Mode if it's already enabled. This prevents
	doubled-up errors in the error log.
*/
Engine.registerDebugMode((initialError, code) => !Utils.options.debug && DebugMode(initialError, code));
/*
	The only consumer of the unguarded enabler should be Harlowe (which runs it on startup if the debug story option is present).
*/
return DebugMode;
});

/*
	TwineMarkup, by Leon Arnott.
	This module, alongside the Patterns module, defines the standard syntax of Harlowe.
*/
/*eslint strict:[2,"function"]*/
(function () {
	"use strict";
	
	let Patterns;
	
	/*
		Polyfill for Object.assign()
	*/
	Object.assign = Object.assign || function polyfilledAssign(obj /* variadic */) {
		for(let i = 1; i < arguments.length; i++) {
			const target = arguments[i];
			for(let key in target) {
				if(hasOwnProperty.call(target, key)) {
					obj[key] = target[key];
				}
			}
		}
		return obj;
	};

	const {keys, assign} = Object;
	
	/*
		When passed a Lexer object, this function augments it with rules.
	*/
	function rules(Lexer) {
		/*
			Creates a function that pushes a token with innerText;
			designed for styling rules like **strong** or //italic//.
			
			If given a second parameter, that is used as the property name
			instead of "innerText"
		*/
		function textTokenFn(name) {
			name = name || "innerText";
			return function(match) {
				/*
					This function returns the rightmost non-zero array-indexed value.
					It's designed for matches created from regexes that only have 1 group.
				*/
				const innerText = match.reduceRight(function(a, b, index) { return a || (index ? b : ""); }, ""),
					data = {};
				
				data[name] = innerText;
				
				return data;
			};
		}
		
		/*
			Creates a function that pushes a token which is its own front and back:
			a token for symmetrical enclosing syntax, such as //italic//.
			The foldedName is the type of the final token, once a pair of these is folded.
		*/
		function openerFn(name, foldedName) {
			const matches = {};
			matches[name] = foldedName;
			return () => ({
				isFront: true,
				matches,
				cannotCross: ["verbatimOpener"],
			});
		}
		
		/*
			Used as a token fn to provide an empty object with no properties,
			regardless of the function's input.
		*/
		const emptyFn = Object.bind(0, null);
		
		/*
			Alters the rules object's fn methods, so that their returned objects
			have 'type', 'match' and 'innerMode' properties assigned to them.
		*/
		function setupRules(mode, target) {
			/*
				Iterate over every rule in the object (the "target").
			*/
			Object.keys(target).forEach((ruleName) => {
				/*
					First, take the function to wrap. Originally this used Function#bind(),
					but speed paranoia suggests a simpler solution.
				*/
				const innerFn = target[ruleName].fn;
				/*
					Then, wrap it as follows:
				*/
				target[ruleName].fn = (match) => {
					/*
						Call the wrapped function and obtain its result.
					*/
					const ret = innerFn(match);
					/*
						Attach the matched text, if it isn't already.
					*/
					if (!ret.text) {
						ret.text = typeof match === "string" ? match : match[0];
					}
					/*
						Give the returned data a type if it didn't
						already have one. Currently no rules have a type which
						varies from the name of the rule.
					*/
					if (!ret.type) {
						ret.type = ruleName;
					}
					/*
						The mode of a token is determined solely by
						which category of rules it is in.
					*/
					if (!ret.innerMode) {
						ret.innerMode = mode;
					}
					return ret;
				};
			});
			return target;
		}
		
		const
			/*
				Modes determine which rules are applicable when. They are (or will be)
				arrays of string keys of the allRules object.
			*/
			/*
				The standard TwineMarkup mode.
			*/
			markupMode     = [],
			/*
				The contents of macro tags - expressions and other macros.
			*/
			macroMode    = [],
			/*
				The contents of strings - just escaped characters and closing quote marks.
			*/
			stringMode   = [];
		
		/*
			These rules objects contain each ordered category of rules.
			(blockRules and inlineRules are currently only differentiated
			for categorisation purposes - they are both equally usable in
			Markup Mode.)
		*/
		const blockRules = setupRules(markupMode, {
			/*
				First, the block rules.
			*/
			hr: {
				fn: emptyFn,
			},
			bulleted: {
				fn: (match) => ({
					depth: match[1].length,
				}),
			},
			numbered: {
				fn: (match) => ({
					depth: match[1].length / 2,
				}),
			},
			heading: {
				fn: (match) => ({
					depth: match[1].length,
				}),
			},
			/*
				Text align syntax
				
				==>      : right-aligned
				=><=     : centered
				<==>     : justified
				<==      : left-aligned (undoes the above)
				===><=   : margins 3/4 left, 1/4 right
				=><===== : margins 1/6 left, 5/6 right, etc.
			*/
			align: {
				fn(match) {
					let align;
					const
						arrow = match[1],
						centerIndex = arrow.indexOf("><");
						
					if (~centerIndex) {
						/*
							Find the left-align value
							(Since offset-centered text is centered,
							halve the left-align - hence I multiply by 50 instead of 100
							to convert to a percentage.)
						*/
						align = Math.round(centerIndex / (arrow.length - 2) * 50);
						if (align === 25) {
							align = "center";
						}
					} else if (arrow[0] === "<" && arrow.slice(-1) === ">") {
						align = "justify";
					} else if (arrow.indexOf(">") >-1) {
						align = "right";
					} else if (arrow.indexOf("<") >-1) {
						align = "left";
					}
					return { align };
				},
			},
			/*
				Text column syntax
				
				==|      : right column, width 1
				=|=      : center column
				|==      : left column
				|==|     : no columns
				==|||    : right column, width 3
			*/
			column: {
				fn(match) {
					let column;
					const
						arrow = match[1],
						centerIndex = arrow.indexOf("|");
						
					if (centerIndex && centerIndex < arrow.length - 1) {
						column = "center";
					} else if (arrow[0] === "|" && arrow.slice(-1) === "|") {
						column = "none";
					} else if (centerIndex === arrow.length - 1) {
						column = "right";
					} else if (!centerIndex) {
						column = "left";
					}
					return {
						column,
						width: /\|+/.exec(arrow)[0].length,
						marginLeft: /^=*/.exec(arrow)[0].length,
						marginRight: /=*$/.exec(arrow)[0].length,
					};
				},
			},
		});
		/*
			All block rules have a single specific canFollow and cannotFollow.
		*/
		const blockRuleConstraint = prev => {
			switch(prev && prev.type) {
				case null: case "br": case "hr": case "bulleted": case "numbered": case "heading": case "align": case "column": case "escapedLine":
				return true;
			}
			return false;
		};
		keys(blockRules).forEach((key) => {
			blockRules[key].constraint = blockRuleConstraint;
			blockRules[key].cannotFollowText = true;
		});
		
		/*
			Now, the inline rules.
		*/
		const inlineRules = setupRules(markupMode, {
		
			/*
				This is a legacy match that simply provides
				an error to those who have mistakenly deployed Twine 1
				macro syntax in Twine 2.
			*/
			twine1Macro: {
				fn: () => ({
					type: "error",
					message: "Harlowe macros use a different syntax to Twine 1, SugarCube, and Yarn macros.",
				}),
			},
			
			/*
				The order of these four is strictly important. As the back and front versions
				use identical tokens, back tokens should appear first. And, the order of em and strong
				should be swapped for the front tokens.
				This allows the following syntax to be parsed correctly:
				***A*** -> <em><strong>A</strong></em>
			*/
			emBack: {
				fn: () => ({
					matches: {
						emFront: "em",
					},
					cannotCross: ["verbatimOpener"],
				}),
			},
			strongBack: {
				fn: () => ({
					matches: {
						strongFront: "strong",
					},
					cannotCross: ["verbatimOpener"],
				}),
			},
			strongFront: {
				fn: () => ({
					isFront: true,
				}),
			},
			emFront: {
				fn: () => ({
					isFront: true,
				}),
			},
			
			boldOpener:    { fn: openerFn("boldOpener",   "bold")   },
			italicOpener:  { fn: openerFn("italicOpener", "italic") },
			strikeOpener:  { fn: openerFn("strikeOpener", "strike") },
			supOpener:     { fn: openerFn("supOpener",    "sup")    },
			
			commentFront: {
				fn: () => ({
					isFront: true,
				}),
			},
			commentBack: {
				fn: () => ({
					matches: {
						commentFront: "comment",
					},
				}),
			},
			// This must come before the generic tag rule
			scriptStyleTag: { fn:        emptyFn },
			tag:            { fn:        emptyFn },
			url:            { fn:        emptyFn },
			
			hookPrependedFront: {
				fn: (match) => ({
					name: match[1],
					hidden: match[2] === ")",
					isFront: true,
					tagPosition: "prepended"
				}),
			},
			
			hookFront: {
				fn: () => ({
					isFront: true,
				}),
			},
			
			hookBack: {
				fn: () => ({
					matches: {
						// Matching front token : Name of complete token
						hookPrependedFront: "hook",
						hookFront: "hook",
					},
					cannotCross: ["verbatimOpener"],
				}),
			},

			hookAppendedBack: {
				fn: (match) => ({
					name: match[2],
					hidden: match[1] === "(",
					tagPosition: "appended",
					matches: {
						hookFront: "hook",
					},
					cannotCross: ["verbatimOpener"],
				}),
			},
			
			unclosedHook: {
				fn: emptyFn,
			},

			unclosedHookPrepended: {
				fn: (match) => ({
					type: "unclosedHook",
					name: match[1],
					hidden: match[2] === ")",
				}),
			},

			verbatimOpener: {
				fn(match) {
					let number = match[0].length,
						matches = {};
					
					matches["verbatim" + number] = "verbatim";
					
					return {
						type: "verbatim" + number,
						isFront: true,
						matches,
						// This is an unfortunate hack to allow this token
						// to match with a cannotCross of "verbatimOpener".
						aka: 'verbatimOpener',
					};
				},
			},

			unclosedCollapsed: {
				fn: emptyFn,
			},

			collapsedFront: {
				fn: () => ({
					isFront: true,
				}),
			},
			collapsedBack: {
				fn: () => ({
					matches: {
						collapsedFront: "collapsed",
					},
					cannotCross: ["verbatimOpener"],
				}),
			},
			escapedLine: {
				fn: emptyFn,
			},
			legacyLink: {
				fn: (match) => ({
					type: "twineLink",
					innerText: match[1],
					passage: match[2],
					innerMode: markupMode,
				}),
			},
			/*
				Like GitHub-Flavoured Markdown, Twine preserves line breaks
				within paragraphs.
			*/
			br:            { fn: emptyFn, },
		});
		
		/*
			Expression rules.
		*/
		const expressionRules = assign(setupRules(macroMode, {
			macroFront: {
				fn: (match) => ({
					isFront: true,
					name: match[1],
				}),
			},
			groupingBack: {
				fn: () => ({
					matches: {
						groupingFront:
							"grouping",
						macroFront:
							"macro",
					},
					cannotCross: ["singleStringOpener", "doubleStringOpener", "hookFront"],
				}),
			},
			
			/*
				Passage links desugar to (link-goto:) calls, so they can
				be used in expression position.
			*/
			passageLink: {
				fn(match) {
					const
						p1 = match[1] || '',
						p2 = match[2] || '',
						p3 = match[3] || '';
					return {
						type: "twineLink",
						innerText: p2 ? p3 : p1,
						passage:   p1 ? p3 : p2,
						innerMode: markupMode,
					};
				},
			},
			
			simpleLink: {
				fn: (match) => ({
					type: "twineLink",
					innerText: match[1] || '',
					passage:   match[1] || '',
					innerMode: markupMode,
				}),
			},
			
			variable:   {
				constraint: (prev) => !prev || prev.type !== "macroFront",
				fn: textTokenFn("name")
			},
			
			tempVariable: {
				constraint: (prev) => !prev || prev.type !== "macroFront",
				fn: textTokenFn("name")
			},
		}), {
			/*
				Plain unappended hooks are allowed in expression position as well as
				inline position. This is implemented by copying the fully-set-up rules
				from inlineRules.
			*/
			hookFront: inlineRules.hookFront,
			hookBack:  inlineRules.hookBack,
		});
		
		/*
			Now, macro code rules.
		*/
		const macroRules = setupRules(macroMode, {
				/* Required to allow HTML comments to contain incomplete macro calls like (set: */
				commentBack: {
					fn: () => ({
						matches: {
							commentFront: "comment",
						},
					}),
				},

				macroName: {
					// This must be the first token inside a macro.
					constraint: (prev) => prev && prev.type === "macroFront",
					fn: textTokenFn("name"),
				},

				groupingFront: {
					fn: () => ({
						isFront: true,
					}),
				},
				
				/*
					Warning: the property pattern "'s" conflicts with the string literal
					pattern - "$a's b's" resembles a string literal. To ensure that
					the former is always matched first, this rule must come before it.
				*/
				property: {
					fn: textTokenFn("name"),
					constraint(prev) {
						if (prev) {
							switch(prev.type) {
								case "variable": case "hookName": case "property": case "tempVariable": case "colour":
								case "itsProperty": case "belongingItProperty": case "macro": case "grouping": case "string":
								/*
									These must also be included so that the correct error can be reported.
								*/
								case "datatype": case "hook": case "boolean": case "number":
									return true;
							}
						}
					},
				},
				
				possessiveOperator: { fn: emptyFn },
				
				itsProperty: {
					cannotFollowText: true,
					fn: textTokenFn("name"),
				},
				
				itsOperator: {
					cannotFollowText: true,
					fn: emptyFn,
				},
				
				/*
					Since this is a superset of the belongingProperty rule,
					this must come before it.
				*/
				belongingItProperty: {
					cannotFollowText: true,
					fn: textTokenFn("name"),
				},
				
				belongingItOperator: {
					cannotFollowText: true,
					fn: emptyFn
				},
				
				belongingProperty: {
					cannotFollowText: true,
					fn: textTokenFn("name"),
				},
				
				belongingOperator: {
					cannotFollowText: true,
					fn: emptyFn
				},
				
				escapedStringChar: {
					fn() {
						return { type: "text", };
					},
				},
				
				singleStringOpener: {
					fn: () => ({
						isFront: true,
						matches: {
							singleStringOpener:
								"string",
						},
						innerMode: stringMode,
					}),
				},
				doubleStringOpener: {
					fn: () => ({
						isFront: true,
						matches: {
							doubleStringOpener:
								"string",
						},
						innerMode: stringMode,
					}),
				},
				
				hookName:  { fn: textTokenFn("name") },
				
				cssTime: {
					fn: (match) => ({
						value: +match[1]
							* (match[2].toLowerCase() === "s" ? 1000 : 1),
					}),
				},
				
				datatype: {
					cannotFollowText: true,
					fn: (match) => ({
						name: match[0].toLowerCase(),
					}),
				},

				colour: {
					cannotFollowText: true,
					/*
						The colour names are translated into hex codes here,
						rather than later in TwineScript.
					*/
					fn(match) {
						let colour,
							m = match[0].toLowerCase(),
							/*
								These colours are only at 80% saturation, so that
								authors using them as bare colours aren't unwittingly
								using horridly oversaturated shades.
							*/
							mapping = {
								"red"    : "e61919",
								"orange" : "e68019",
								"yellow" : "e5e619",
								"lime"   : "80e619",
								"green"  : "19e619",
								"cyan"   : "19e5e6",
								"aqua"   : "19e5e6",
								"blue"   : "197fe6",
								"navy"   : "1919e6",
								"purple" : "7f19e6",
								"fuchsia": "e619e5",
								"magenta": "e619e5",
								"white"  : "fff",
								"black"  : "000",
								"gray"   : "888",
								"grey"   : "888",
							};
						
						if (hasOwnProperty.call(mapping, m)) {
							colour = "#" + mapping[m];
						}
						else {
							colour = m;
						}
						
						return {
							colour,
						};
					},
				},
				
				number: {
					/*
						This fixes accidental octal (by eliminating octal)
					*/
					fn: (match) => ({
						value: parseFloat(match[0]),
					}),
				},
				inequality: {
					fn: (match) => ({
						operator: match[2],
						negate: match[1].indexOf('not') >-1,
					}),
				},
				augmentedAssign: {
					fn: (match) => ({
						// This selects just the first character, like the + of +=.
						operator: match[0][0],
					}),
				},
				identifier: {
					fn: textTokenFn("name"),
					cannotFollowText: true,
				},

				whitespace: {
					fn: emptyFn,
					/*
						To save creating tokens for every textual space,
						this restriction is in place. It should have no effect
						on syntactic whitespace.
					*/
					cannotFollowText: true,
				},

				incorrectOperator: {
					fn: (match) => {
						const correction = {
							"=>": ">=",
							"=<": "<=",
							"gte": ">=",
							"lte": "<=",
							"gt": ">",
							"lt": "<",
							"eq": "is",
							"isnot": "is not",
							"neq": "is not",
							"isa": "is a",
							"are": "is",
							"x": "*",
							"or a" : "or",
						}[match[0].toLowerCase().replace(/\s+/g,' ')];

						return {
							type: "error",
							message: "Please say "
								+ (correction ? "'" + correction + "'" : "something else")
								+ " instead of '" + match[0] + "'.",
							explanation: "In the interests of readability, I want certain operators to be in a specific form.",
						};
					},
					cannotFollowText: true,
				},
			// As these consist of word characters, they cannot follow text nodes, lest they
			// match subwords like "xxisxx".
			...["boolean", "is", "to", "into", "where", "when", "via", "making", "each", "and", "or", "not",
			"isNot", "contains", "doesNotContain", "isIn", "isA", "isNotA", "isNotIn", "matches", "doesNotMatch", "bind"].reduce((a, e) => {
				a[e] = {
					fn: emptyFn,
					cannotFollowText: true,
				};
				return a;
			},{}),
			// These, being purely or partly symbols, do not have that necessity.
			...["comma", "spread", "typeSignature", "addition", "subtraction",
			"multiplication", "division"].reduce((a, e) => {
				a[e] = { fn: emptyFn };
				return a;
			},{})
		});

		/*
			String mode is a special mode which contains only these three elements, designed for the interiors of strings.
		*/
		const stringRules = setupRules(stringMode, {
			singleStringCloser:  macroRules.singleStringOpener,
			doubleStringCloser:  macroRules.doubleStringOpener,
			escapedStringChar:   macroRules.escapedStringChar,
		});

		/*
			Now that all of the rule categories have been defined, the modes can be
			defined as selections of these categories.
			
			Note: as the mode arrays are passed by reference by the above,
			the arrays must now be modified in-place, using [].push.apply().
		*/
		markupMode.push(            ...keys(blockRules),
									// expressionRules must come before inlineRules because
									// passageLink conflicts with hookAnonymousFront.
									...keys(expressionRules),
									...keys(inlineRules));
		
		/*
			Warning: the property pattern "'s" conflicts with the string literal
			pattern - "$a's b's" resembles a string literal. To ensure that
			the former is always matched first, expressionRules
			must be pushed first.
		*/
		macroMode.push(             ...keys(expressionRules),
									...keys(macroRules));

		stringMode.push(            ...keys(stringRules));

		/*
			Merge all of the categories together.
		*/
		const allRules = { ...blockRules, ...inlineRules, ...expressionRules, ...macroRules, ...stringRules };
		
		/*
			Add the 'pattern' property to each rule
			(the RegExp used by the lexer to match it), as well
			as some other properties.
		*/
		keys(allRules).forEach((key) => {
			/*
				Each named rule uses the same-named Pattern for its
				regular expression.
				That is, each rule key *should* map directly to a Pattern key.
				The Patterns are added now.
			*/
			/*
				Plain-compare patterns are used as-is without being converted to RegExp.
			*/
			if (Patterns.PlainCompare[key]) {
				allRules[key].pattern =  Patterns.PlainCompare[key];
				allRules[key].plainCompare = true;
			}
			else {
				allRules[key].pattern = RegExp(
					"^(?:" + Patterns[key] + ")",
					/*
						All TwineMarkup patterns are case-insensitive.
					*/
					"i"
				);
			}
		});
		assign(Lexer.rules, allRules);

		const {modes} = Lexer;
		/*
			Declare that the starting mode for lexing, before any
			tokens are appraised, is...
		*/
		modes.start = modes.markup = markupMode;
		/*
			But macroMode is also exposed in order for certain consumers
			(such as the documentation) to be able to lex in that context.
		*/
		modes.macro = macroMode;
		modes.string = stringMode;
		return Lexer;
	}
	
	function exporter(Lexer) {
		/*
			Export the TwineMarkup module.
			
			Since this is a light freeze, Patterns is still modifiable.
		*/
		return Object.freeze({
			
			lex: rules(Lexer).lex,
			
			/*
				The Patterns are exported for use by consumers in understanding
				the specifics of Harlowe's markup language.
			*/
			Patterns,
		});
	}
	
	/*
		This requires the Patterns and Lexer modules.
	*/
	if(typeof module === 'object') {
		Patterns = require('./patterns');
		module.exports = exporter(require('./lexer'));
	}
	else if(typeof define === 'function' && define.amd) {
		define('markup', ['lexer', 'patterns'], function (Lexer, P) {
			Patterns = P;
			return exporter(Lexer);
		});
	}
	// Loaded as a story format in TwineJS 2.3
	else if (this && this.loaded && this.modules) {
		Patterns = this.modules.Patterns;
		this.modules.Markup = exporter(this.modules.Lexer);
	}
	// Loaded in TwineJS 2.4.
	else {
		Patterns = this.Patterns;
		this.Markup = exporter(this.Lexer);
	}
}).call(eval('this') || (typeof global !== 'undefined' ? global : window));

/*
	The Patterns are the raw strings used by the lexer to match tokens.
	These are used primarily by the Markup module, where they are attached to
	lexer rules.
*/
/*eslint strict:[2,"function"]*/
(function() {
	"use strict";
	let Patterns;
	
	/*
		Escapes characters in a string so that RegExp(str) produces a valid regex.
	*/
	function escape(str) {
		// This function may also accept objects, whereupon it applies itself
		// to every enumerable in the object.
		if (str && typeof str === "object") {
			Object.keys(str).forEach(function(e) {
				str[e] = escape(str[e]);
			});
			return str;
		}
		return (str+"").replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
	}
	
	/*
		A sugar REstring function for negative character sets.
		This escapes its input.
	*/
	function notChars(/* variadic */) {
		return "[^" + Array.apply(0, arguments).map(escape).join("") + "]*";
	}
	
	/*
		Creates sugar functions which put multiple REstrings into parentheses, separated with |,
		thus producing a capturer or a lookahead.
		This does NOT escape its input.
	*/
	function makeWrapper(starter) {
		return function(/* variadic */) {
			return "(" + starter+Array.apply(0, arguments).join("|") + ")";
		};
	}
	
	const
		either = makeWrapper("?:"),
		notBefore = makeWrapper("?!"),
		before = makeWrapper("?=");
	
	const
		/*d:
			Whitespace markup

			"Whitespace" is a term that refers to "space" characters that you use to separate programming code tokens,
			such as the spacebar space, and the tab character. When used inside the macro syntax, they are considered interchangeable in type and quantity -
			using two spaces usually has the same effect as using one space, one tab, and so forth.

			Harlowe tries to also recognise most forms of [Unicode-defined whitespace](https://en.wikipedia.org/wiki/Whitespace_character#Unicode),
			including the quads, the per-em and per-en spaces, but not the zero-width space characters (as they may
			cause confusion and syntax errors if unnoticed in your code).

			#whitespace 1
		*/
		// This includes all forms of Unicode 6 whitespace except \n, \r, and Ogham space mark.
		ws                   = "[ \\f\\t\\v\\u00a0\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]*",
		
		// Mandatory whitespace
		mws                  = ws.replace("*","+"),
		
		// Word break
		wb                   = "\\b",
		
		//Escaped line
		escapedLine          =  "\\\\\\n\\\\?|\\n\\\\",
		
		// Line break without postfix escape
		br                   = "\\n(?!\\\\)",
		
		// Handles Unicode ranges not covered by \w.
		// This includes every surrogate pair character, but doesn't check their order or pairing.
		anyLetter            = "[\\w\\-\\u00c0-\\u00de\\u00df-\\u00ff\\u0150\\u0170\\u0151\\u0171\\uD800-\\uDFFF]",
		// Identical to the above, but excludes hyphens.
		anyLetterStrict      =    anyLetter.replace("\\-", ""),
		
		eol                  = either("\\n", "$"),

		
		/*d:
			Bulleted list markup

			You can create bullet-point lists in your text by beginning lines with an asterisk `*`, followed by whitespace,
			followed by the list item text. The asterisk will be replaced with an indented bullet-point. Consecutive lines
			of bullet-point items will be joined into a single list, with appropriate vertical spacing.

			Remember that there must be whitespace between the asterisk and the list item text! Otherwise, this markup
			will conflict with the emphasis markup.

			If you use multiple asterisks (`**`, `***` etc.) for the bullet, you will make a nested list, which is indented deeper than
			a normal list. Use nested lists for "children" of normal list items.
			
			Example usage:
			```
			 * Bulleted item
			    *    Bulleted item 2
			  ** Indented bulleted item
			```

			#list
		*/
		
		bullet      = "\\*",
		
		bulleted    = ws + "(" + bullet + "+)" + mws,
		
		/*d:
			Numbered list markup

			You can create numbered lists in your text, which are similar to bulleted lists, but feature numbers in place of bullets.
			Simply begin single lines with `0.`, followed by whitespace, followed by the list item text. Consecutive items will be
			joined into a single list, with appropriate vertical spacing. Each of the `0.`s will be replaced
			with a number corresponding to the item's position in the list.

			Remember that there must be whitespace between the `0.` and the list item text! Otherwise, it will be regarded as a plain
			number.

			If you use multiple `0.` tokens (`0.0.`, `0.0.0.` etc.) for the bullet, you will make a nested list, which uses different
			numbering from outer lists, and are indented deeper. Use nested lists for "children" of normal list items.

			Example usage:
			```
			0. Numbered item
			   0. Numbered item 2
			 0.0. Indented numbered item
			```

			#list
		*/
		numberPoint = "(?:0\\.)",
		
		numbered    = ws + "(" + numberPoint + "+)" + mws,
		
		/*d:
			Horizontal rule markup

			A hr (horizontal rule) is a thin horizontal line across the entire passage. In HTML, it is a `<hr>` element.
			In Harlowe, it is an entire line consisting of 3 or more consecutive hyphens `-`.

			Example usage:
			```
			        ---
			  ----
			     -----
			```
			Again, opening whitespace is permitted prior to the first `-` and after the final `-`.

			#section
		*/
		hr          = ws + "-{3,}" + ws + eol,
		
		/*d:
			Heading markup

			Heading markup is used to create large headings, such as in structured prose or title splash passages.
			It is almost the same as the Markdown heading syntax: it starts on a fresh line,
			has one to six consecutive `#`s, and ends at the line break.

			Example usage:
			```
			#Level 1 heading renders as an enclosing `<h1>`
			   ###Level 3 heading renders as an enclosing `<h3>`
			 ######Level 6 heading renders as an enclosing `<h6>`
			```

			As you can see, unlike in Markdown, opening whitespace is permitted before the first #.

			#section
		*/
		heading = ws + "(#{1,6})" + ws,
		
		/*d:
			Aligner markup

			An aligner is a special single-line token which specifies the alignment of the subsequent text. It is essentially
			'modal' - all text from the token onward (until another aligner is encountered) is wrapped in a `<tw-align>` element
			(or unwrapped in the case of left-alignment, as that is the default).

			 * Right-alignment, resembling `==>`~ is produced with 2 or more `=`s followed by a `>`.
			 * Left-alignment, resembling `<==`~ is restored with a `<` followed by 2 or more `=`.
			 * Justified alignment, resembling `<==>`~ is produced with `<`, 2 or more `=`, and a closing `>`.
			 * Mixed alignment is 1 or more `=`, then `><`, then 1 or more `=`. The ratio of quantity of left `=`s and right `=`s determines
			the alignment: for instance, one `=` to the left and three `=`s to the right produces 25% left alignment.
			
			Any amount of whitespace is permitted before or after each token, as long as it is on a single line.

			Example usage:
			```
			==>
			This is right-aligned
			  =><=
			This is centered
			 <==>
			This is justified
			<==
			This is left-aligned (undoes the above)
			===><=
			This has margins 3/4 left, 1/4 right
			  =><=====
			This has margins 1/6 left, 5/6 right.

			(Try expanding this code preview using the bar on the left.)
			```

			You may apply alignment to specific hooks in your passages by attaching the (align:) macro to them.

			#section
		*/
		align = ws + "(==+>|<=+|=+><=+|<==+>)" + ws + eol,

		/*d:
			Column markup

			Column markup is, like aligner markup, a special single-line token which indicates that the subsequent text should be laid out in columns. They consist of a number of `|` marks, indicating the size of the column relative to the other columns - the total width of all columns equals the page width, and this is divided among the columns by their `|` marks. They also have a number of `=` marks surrounding it, indicating the size of the column's margins in CSS "em" units (which are about the width of a capital M).

			All text from the token onward, until the next token is encountered, is contained in the specified column. A `|==|` token ends the set of columns and returns the page to normal.

			Columns are laid out from left to right, in order of appearance.
			
			Any amount of whitespace is permitted before or after each token, as long as it is on a single line.

			Example usage:
			```
			(change:?passage, (text-size:0.6))
			|==
			This is in the leftmost column, which has a right margin of about 2 letters wide.
			    =|||=
			This is in the next column, which has margins of 1 letter wide. It is three times as wide as the left column.
			 =====||
			This is in the right column, which has a right margin of about 5 letters wide. It is twice as wide as the left column.
			  |==|
			This text is not in columns, but takes up the entire width, as usual.

			(Try expanding this code preview using the bar on the left.)
			```

			You can create nested columns by enclosing the inner set of columns in an unnamed hook, like so.
			```
			(change:?passage, (text-size:0.6))
			|==
			This is the outer left column.
			==|
			This is the outer right column.
			[\
			  |==
			This is the inner left column, inside the outer right column.
			  ==|
			This is the inner right column, inside the outer right column.
			\]
			```

			#section
		*/
		column = ws + "(=+\\|+|\\|+=+|=+\\|+=+|\\|=+\\|)" + ws + eol,
		
		/*d:
			Link markup

			Hyperlinks are the player's means of moving between passages and affecting the story. They consist of
			*link text*, which the player clicks on, and a *passage name* to send the player to.

			Inside matching non-nesting pairs of `[[` and `]]`, place the link text and the passage name,
			separated by either `->` or `<-`, with the arrow pointing to the passage name.

			You can also write a shorthand form, where there is no `<-` or `->` separator.
			The entire content is treated as a passage name, and its evaluation is treated as the link text.

			Example usage:
			```
			[[Go to the cellar->Cellar]] is a link that goes to a passage named "Cellar".
			[[Parachuting<-Jump]] is a link that goes to a passage named "Parachuting".
			[[Down the hatch]] is a link that goes to a passage named "Down the hatch".
			```

			Details:

			The interior of a link (the text between `[[` and `]]`) may contain any character except `]`. If additional
			`->`s or `<-`s appear, the rightmost right arrow or leftmost left arrow is regarded as the canonical separator.
			* `[[A->B->C->D->E]]` has a link text of "A->B->C->D" and a passage name of "E"
			* `[[A<-B<-C<-D<-E]]` has a link text of "B<-C<-D<-E" and a passage name of "A".

			If the passage name of a link does not exactly match that of an existing passage, but it does if you render the
			markup in or around it, then Harlowe will use that name. So, you can put markup inside the link, as well as variables
			or value macros like (either:).
			* `[[//Seagulls!//]]` will link to the passage named "//Seagulls!//" if it exists, or the passage named "Seagulls!" if that exists.
			* `[[Shelly?->$shellyPlace]]` is a link that goes to the passage whose name is in the variable `$shellyPlace`.

			However, you can't put commands or changers in the passage name. `[[Really, now.->(print:$explain)]]` will cause an error.

			Links can be customised by attaching changer macros, like (transition-depart:) or (text-style:). Just
			place one in front of the link, like so: `(t8n-depart:"dissolve")[[Recall that day]]` - or attach a variable containing
			one: `$memory[[Recall that day]]`. You can also customise every link in the passage using (change:) or (enchant:), and ?Link.

			This syntax is not the only way to create links – there are many link macros, such as (link:), which can
			be used to make more versatile hyperlinks in your story.

			#basics
		*/
		passageLink = {
			opener:            "\\[\\[(?!\\[)",
			text:              "(" + notChars("]") + ")",
			rightSeparator:    either("\\->", "\\|"),
			leftSeparator:     "<\\-",
			closer:            "\\]\\]",
			legacySeparator:   "\\|",
			legacyText:        "(" + either("[^\\|\\]]", "\\]" + notBefore("\\]")) + "+)",
		},
		
		/*
			This determines the valid characters for a property name. Sadly, "-" is not allowed.
			As of 1.1, this must include at least 1 non-numeral non-underscore.
		*/
		validPropertyName =
			anyLetterStrict + "*"
			+ anyLetterStrict.replace("\\w","a-zA-Z")
			+ anyLetterStrict + "*",
		
		/*d:
			Variable markup
			
			As described in the documentation for the (set:) macro, variables are used to remember data values
			in your game, keep track of the player's status, and so forth. They start with `$` (for normal variables)
			or `_` (for temp variables, which only exist inside a single passage, hook or lambda).

			Due to this syntax potentially conflicting with dollar values (such as $1.50) in your story text,
			variables cannot begin with a numeral.

			You can print the contents of variables, or any further items within them, using the (print:) and (for:)
			macros. Or, if you only want to print a single variable, you can just enter the variable's name directly
			in your passage's prose.

			```
			(set: $plushieName to "Whispy", _heldItem to "briefcase")
			Your beloved plushie, $plushieName, awaits you after a long work day.
			You put your _heldItem down and lift it for a snuggle.
			```

			Furthermore, if the variable contains a changer command, such as that created by (text-style:) and such,
			then the variable can be attached to a hook to apply the changer to the hook:

			```
			(set: $robotText to (font:"Courier New"), _assistantText to (size:0.8))
			$robotText[Good golly! Your flesh... it's so soft!]
			_assistantText[Don't touch me, please! I'm ticklish.]
			```

			**Note:** While you can normally display the contents of variables by simply placing their names directly in passage prose,
			such as `$ship` or `$crew`, you have to use another macro, such as (print:), to display the contents of arrays, datamaps, or other structures,
			such as `(print: $ship's mast)` or `(print: $crew's 1st)`.

			**Note 2:** Even though named hooks' names are case-insensitive, variable names are case-sensitive. So, `$Chips` and `$chips` are considered
			different variables.

			**Note 3:** In Harlowe 3, If you use a story-wide variable that doesn't exist (that is, it hasn't been created via (set:), (put:), and so forth), then
			a default value of 0 will be used in its place. So, `(print: $nonexistantVariable)` will show the text "0". This is likely to change in a future version
			of Harlowe, however.

			#coding 2
		*/
		variable          = "\\$(" + validPropertyName + ")",

		tempVariable      = "_(" + validPropertyName + ")",
		
		property          = "'s" + mws + notBefore("_") + "(" + validPropertyName + ")",
		
		belongingProperty = "(" + validPropertyName + ")" + mws + "of" + wb + notBefore("it" + wb),
		
		/*
			Computed properties are of the form:
			$a's (expression)
			or
			(expression) of $a
		*/
		possessiveOperator = "'s" + mws,
		
		/*
			Computed properties are of the form:
			$a's (expression)
		*/
		belongingOperator = "of" + wb,
		
		/*
			Identifiers: either "it", "time", "visit", "visits", "exit", "exits", or "pos".
			"it" is a bit of a problem because its possessive is "its", not "it's",
			so we can't use a derivation similar to property.
		*/
		identifier          = either("it","time","turns?","visits?","exits?","pos") + wb,
		
		itsProperty         = "its" + mws + "(" + validPropertyName + ")",
		
		itsOperator         = "its" + wb,
		
		belongingItProperty = "(" + validPropertyName + ")" + mws + "of" + mws + "it" + wb,
		
		belongingItOperator = "of" + mws + "it" + wb,

		macro = {
			opener:            "\\(",
			name:              "(" + either("\\$", "_") + "?" + anyLetter + "+):" + notBefore('\\/'),
			closer:            "\\)",
		},
		
		twine1Macro = "<<[^>\\s]+\\s*(?:\\\\.|'(?:[^'\\\\]*\\\\.)*[^'\\\\]*'|\"(?:[^\"\\\\]*\\\\.)*[^\"\\\\]*\"|[^'\"\\\\>]|>(?!>))*>>",

		incorrectOperator = either("=<", "=>", "[gl]te?" + wb, "n?eq" + wb, "isnot" + wb, "are" + wb, "x" + wb,
			"isa" + wb, "or" + mws + "a" + wb),
		
		tag = {
			name:              "[a-zA-Z][\\w\\-]*",
			attrs:             "(?:\"[^\"]*\"|'[^']*'|[^'\">])*?",
		},

		hookTagFront =  "\\|(" + anyLetter + "+)(>|\\))",
		hookTagBack  =  "(<|\\()("   + anyLetter + "+)\\|",

		
		number = '((?:\\b\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+\\-]?\\d+)?)' + notBefore("m?s") + wb
		;
	
	passageLink.main =
		passageLink.opener
		+ either(
			passageLink.text + passageLink.rightSeparator,
			/*
				The rightmost right arrow or leftmost left arrow
				is regarded as the canonical separator.
			
				[[A->B->C->D->E]] has a link text of
					A->B->C->D
					and a passage name of
					E
			
				[[A<-B<-C<-D<-E]] has a link text of
					B<-C<-D<-E
					and a passage name of
					A
			
				Thus, the left separator's preceding text must be non-greedy.
			*/
			passageLink.text.replace("*","*?") + passageLink.leftSeparator
		)
		+ passageLink.text;
	
	/*
		Return the Patterns object.
		
		Note that some of these properties are "opener" objects, which are used by the
		lexer. It's a bit #awkward having them alongside the string properties like this,
		keyed to a similar but otherwise disconnected property name...
	*/
	Patterns = {
		
		upperLetter: "[A-Z\\u00c0-\\u00de\\u0150\\u0170]",
		lowerLetter: "[a-z0-9_\\-\\u00df-\\u00ff\\u0151\\u0171]",
		anyLetter,
		anyLetterStrict,
		
		// This is used only for macroMode, NOT markup modes.
		whitespace:
			mws.replace("[","[\\n\\r"),
		
		/*d:
			Escaped line break markup
			
			Sometimes, you may want to write an especially long line, potentially containing many macros.
			This may not be particularly readable in the passage editor, though. One piece of markup that
			may help you is the `\` mark - placing it just before a line break, or just after it, will cause the line break
			to be removed from the passage, thus "joining together" the lines.

			Example usage:
			```
			This line \
			and this line
			\ and this line, are actually just one line.
			```

			Details:
			There must not be any whitespace between the `\` and the line break. Otherwise, it won't work. (In the Twine editor, the `\` will change
			from yellow to gray, indicating it's no longer considered an escaped line break.)

			Like most passage text markup, this cannot be used inside a macro call (for instance, `(print: \`<br>
			`3)`) - but since line breaks between values in macro calls are ignored, this doesn't matter.

			#whitespace 4
		*/
		escapedLine,
		
		br,

		/*d:
			HTML markup

			If you are familiar with them, HTML tags (like `<img>`) and HTML escapes (like `&sect;`) can be inserted
			straight into your passage text. They are treated very naively - they essentially pass through Harlowe's
			markup-to-HTML conversion process untouched.

			Example usage:
			```
			<mark>This is marked text.

			&para; So is this.

			And this.</mark>
			```

			Details:

			HTML elements included in this manner are given a `data-raw` attribute by Harlowe, to distinguish them
			from elements created via markup.

			You can include a `<script>` tag in your passage to run Javascript code. The code will run as soon as the
			containing passage code is rendered. See the "HTML script tag" article for more details.

			You can also include a `<style>` tag containing CSS code. The CSS should affect the entire page
			until the element is removed from the DOM. You could use this in a "header" or "footer" tagged passage, inside an (if:) hook,
			to make the CSS apply to every passage where the (if:) condition is fulfilled.

			Finally, you can also include HTML comments `<!-- Comment -->` in your code, if you wish to leave
			reminder messages or explanations about the passage's code to yourself.

			#extra
		*/
		tag:         "<\\/?" + tag.name + tag.attrs + ">",
		
		/*
			<textarea> elements also have the exemption from their contents being interpreted as Harlowe code.
		*/
		scriptStyleTag: "<(" + either("script","style","textarea")
			+ ")" + tag.attrs + ">"
			+ "[^]*?" + "<\\/\\1>",
		scriptStyleTagOpener:  "<",
		
		url:         "(" + either("https?","mailto","javascript","ftp","data") + ":\\/\\/[^\\s<]+[^<.,:;\"')\\]\\s])",
		
		bullet,
		
		hr,
		heading,
		align,
		column,
		bulleted,
		numbered,
		
		/*d:
			Verbatim markup

			As plenty of symbols have special uses in Harlowe, you may wonder how you can use them normally, as mere symbols,
			without invoking their special functionality. You can do this by placing them between a pair of `` ` `` marks.

			If you want to escape a section of text which already contains single `` ` `` marks, simply increase the number
			of `` ` `` marks used to enclose them.

			Example usage:
			* ```I want to include `[[double square brackets]]` in my story, so I use grave ` marks.```
			* ```I want to include ``single graves ` in my story``, so I place them between two grave marks.```
			
			There's no hard limit to the amount of graves you can use to enclose the text.

			If you want to make an entire hook to be displayed verbatim, without its markup being rendered,
			you can attach the (verbatim:) changer.

			#extra
		*/
		/*
			The verbatim syntax does not "nest", but terminals can be
			differentiated by adding more ` marks to each pair.
		*/
		verbatimOpener:    "`+",
		
		/*d:
			Named hook markup

			For a general introduction to hooks, see their respective markup description. Named hooks are a less common type of
			hook that offer unique benefits. To produce one, attach a "nametag" to the front or back, similar to how a macro call
			would be attached:

			```
			[This hook is named 'opener']<opener|

			|s2>[This hook is named 's2']
			```

			(Hook nametags are supposed to resemble triangular gift box nametags.)

			A macro can refer to and alter the text content of a named hook by referring to the hook as if it were a variable.
			To do this, write the hook's name as if it were a variable, but use the `?` symbol in place of the `$` symbol:

			```
			[Fie and fuggaboo!]<shout|

			(click: ?shout)[ (replace: ?shout)["Blast and damnation!"] ]
			```

			The above (click:) and (replace:) macros can remotely refer to and alter the hook using its name. This lets you,
			for instance, write a section of text full of tiny hooks, and then attach behaviour to them further in the passage:

			```
			Your [ballroom gown]<c1| is [bright red]<c2| with [silver streaks]<c3|,
			and covered in [moonstones]<c4|.

			[]<c5|
			(click: ?c1)[(replace:?c5)[A hand-me-down from your great aunt.]]
			(click: ?c2)[(replace:?c5)[A garish shade, to your reckoning.]]
			(click: ?c3)[(replace:?c5)[Only their faint shine keeps them from being seen as grey.]]
			(click: ?c4)[(replace:?c5)[Dreadfully heavy, they weigh you down and make dancing arduous.]]
			```

			As you can see, the top sentence remains mostly readable despite the fact that several words have (click:) behaviours
			assigned to them.

			Built in names:

			There are four special built-in hook names, ?Page, ?Passage, ?Sidebar, and ?Link, which, in addition to selecting named hooks,
			also affect parts of the page that you can't normally style with macros. They can be styled using the (change:) or (enchant:) macros.

			* `?Page` selects the page element (to be precise, the `<tw-story>` element) and using it with the (change:) and (bg:) macros lets you
			change the background of the entire page.
			* `?Passage` affects just the element that contains the current passage's text (to be precise, the `<tw-passage>` element) and lets you,
			for instance, change the (text-colour:) or (font:) of all the text, or apply complex (css:) to it.
			* `?Sidebar` selects the passage's sidebar containing undo/redo icons (`<tw-sidebar>`). You can style it with styling macros, or use
			(replace:) or (append:) to insert your own text into it.
			* `?Link` selects all of the links (passage links, and those created by (link:) and other macros) in the passage. This is similar to the
			`links` data value for HookName data.

			(Note that, as mentioned above, if you use these names for your own hooks, such as by creating a named hook like `|passage>[]`,
			then they will, of course, be included in the selections of these names.)

			#coding 4
		*/
		/*d:
			Hidden hook markup

			Hidden hooks are an advanced kind of named hook that can be shown using macros like (show:). For a general introduction to
			named hooks, see their respective markup description.

			There may be hooks whose contained prose you don't want to be visible as soon as the passage appears -
			a time delay, or the click of a link should be used to show them. You can set a hook to be *hidden* by altering
			the hook tag syntax - replace the `>` or `<` mark with a parenthesis.

			```
			|visible>[This hook is visible when the passage loads.]
			|cloaked)[This hook is hidden when the passage loads, and needs a macro like `(show:?cloaked)` to reveal it.]

			[My commanding officer - a war hero, and a charismatic face for the military.]<sight|
			[Privately, I despise the man. His vacuous boosterism makes a mockery of my sacrifices.](thoughts|
			```

			(You can think of this as being visually similar to the pointed tails of comic speech balloons vs. round, enclosed
			thought balloons.)

			In order to be useful, hidden hooks must have a name, which macros like (show:) can use to show them. Hence,
			there's no way to make a hidden unnamed hook - at least, without using a conditional macro like (if:).

			#coding 5
		*/

		hookAppendedFront:  "\\[" + notBefore("=+"),
		hookPrependedFront:
			hookTagFront + "\\[" + notBefore("=+"),

		/*d:
			Hook markup

			A hook is a means of indicating that a specific span of passage prose is special in some way. It
			essentially consists of text between single `[` and `]` marks. Prose inside a hook can be modified, styled,
			controlled and analysed in a variety of ways using macros.

			A hook by itself, such as `[some text]`, is not very interesting. However, if you attach a macro or a
			variable to the front, the attached value is used to change the hook in some way, such as hiding
			it based on the game state, altering the styling of its text, moving its text to elsewhere in the passage.

			```
			(font: "Courier New")[This is a hook.

			As you can see, this has a macro call in front of it.]
			This text is outside the hook.
			```

			The (font:) macro is one of several macros which produces a special styling changer, instead of a basic
			data type like a number or a string. In this case, the changer changes the attached hook's font to Courier New,
			without modifying the other text.

			You can save this changer to a variable, and then use it repeatedly, like so.
			```
			(set: $x to (font: "Tahoma"))
			$x[This text is in Tahoma.]
			$x[As is this text.]
			```

			The basic (if:) macro is used by attaching it to a hook, too.

			```
			(if: $x is 2)[This text is only displayed if $x is 2.]
			```

			For more information about changer macros, consult the descriptions for each of them in turn.

			#coding 3
		*/
		hookFront: "\\[" + notBefore("=+"),
		hookBack:  "\\]" + notBefore(hookTagBack),
		
		hookAppendedBack:
			"\\]" + hookTagBack,

		/*d:
			Unclosed hook markup

			This is a special version of the hook markup - an open bracket `[`, followed by any number of `=` marks, that has no matching
			closing bracket. When it is placed in a passage, it indicates that all the prose that follows, until the end of the hook
			that contains it or the end of the passage, is part of a single hook.

			Its main purpose is to let you easily deploy hook changers that apply to the remaining text of the passage, without having
			to place and keep track of closing brackets at the end. For instance, the (click:) macro can be used with the ?page hook name
			to prompt the reader to click anywhere on the page to reveal the rest of the passage. The unclosed hook markup lets you use
			it as many times as you want, without needing to balance a number of closing brackets at the end of the passage.

			```
			(click: ?page)[==
			This text won't appear until the page is clicked once.
			(click: ?page)[==
			This text won't appear until the page is clicked twice.
			(click: ?page)[==
			This text won't appear until the page is clicked three times.
			```

			Other changer macros, such as (link:), (more:), (event:), and (transition:), also work well with this markup.

			Also, unclosed hooks can be named, and marked as hidden, just like other hooks.
			```
			|1>[=
			The rest of this passage is in a hook named "1".
			|2)[=
			This part is also in a hidden hook named "2".
			```

			#coding 6
		*/
		unclosedHook: "\\[=+",
		unclosedHookPrepended: hookTagFront + "\\[=+",
		/*d:
			Unclosed collapsing whitespace markup

			This is a special version of the collapsing whitespace markup - an open curly brace `{`, followed by any number of `=` marks, that has no matching
			closing brace. When it is placed in a passage, it indicates that all the prose that follows, until the end of the hook
			that contains it or the end of the passage, should have its whitespace collapsed.

			As with the the unclosed hook markup, this has advantages in situations where keeping track of closing brackets would be slightly inconvenient.
			If you use revision macros or enchantment macros like (change:), (replace:), (click:) and so forth, you can place those at the end of
			your passage, and use a single `{=` to separate them from the rest of the passage. Additionally, you can place a `{=` at the start of your passage
			to cause the entire passage's whitespace to be collapsed, allowing you to write additional prose without needing to have a closing brace after all of
			your additions.

			```
			This part of the passage
			has normal whitespace.
			{=
			This part of the passage
			has collapsed
			whitespace.
			```

			All of the details pertaining to the collapsing markup apply here - consult its article for more information.

			#whitespace 3
		*/
		unclosedCollapsed: "\\{=+",
		
		passageLink:
			passageLink.main
			+ passageLink.closer,
		
		legacyLink:
			/*
				[[A|B]] has a link text of
					A
					and a passage name of
					B
				
				This isn't preferred because it's the reverse of MediaWiki's links.
			*/
			passageLink.opener
			+ passageLink.legacyText + passageLink.legacySeparator
			+ passageLink.legacyText + passageLink.closer,
		
		simpleLink:
			/*
				As long as legacyLink remains in the grammar,
				use legacyText here to disambiguate.
			*/
			passageLink.opener + passageLink.legacyText + passageLink.closer,
		
		/*d:
			Macro markup

			A macro is a piece of code that is inserted into passage text. Macros are used to accomplish many effects,
			such as altering the game's state, displaying different text depending on the game's state, and altering
			the manner in which text is displayed.

			Built in macros:

			There are many built-in macros in Harlowe. To use one, you must *call* upon it in your passage by writing
			the name, a colon, and some data values to provide it, all in parentheses. For instance, you call the (print:)
			macro like so: `(print: 54)`. In this example, `print` is the macro's name, and `54` is the value.

			The name of the macro is case-insensitive, dash-insensitive and underscore-insensitive. This means that
			almost any combination of case, dashes and underscores in the name will be ignored. You can, for instance, write
			`(go-to:)` as `(goto:)`, `(Goto:)`, `(GOTO:)`, `(GoTo:)`, `(Go_To:)`, `(Got--o:)`, `(-_-_g-o-t-o:)`, or 
			almost any other combination or variation. There is, however, ONE exception: the name cannot start with an underscore
			_, because that would make it a temp variable.

			Custom macros:

			In addition to built-in macros, it is also possible to write your own macros, using the (macro:) macro. You need
			to save these macros inside a variable or temp variable using the (set:) macro. Once you've done so, you can call it
			much like it was a built-in macro, except by replacing the name with the variable: `($someCustomMacro:)` is how you would
			call a custom macro stored in the variable $someCustomMacro, and `(_anotherCustomMacro:)` is how you would
			call a custom macro stored in the temp variable _anotherCustomMacro. Note that you can't use dataname access to
			use macros that are inside arrays or datamaps: `($array's 1st:)` is, unfortunately, not a valid custom macro call.

			Passing data:

			You can provide any type of data values to a macro call - numbers, strings, booleans, and so forth. These
			can be in any form, as well - `"Red" + "belly"` is an expression that produces a single string, "Redbelly",
			and can be used anywhere that the joined string can be used. Variables, too, can be used with macros, if
			their contents matches what the macro expects. So, if `$var` contains the string "Redbelly", then `(print: $var)`,
			`(print: "Redbelly")` and `(print: "Red" + "belly")` are exactly the same.

			Furthermore, each macro call produces a value itself - (num:), for instance, produces a number, (a:) an array - so
			they too can be nested inside other macro calls. `(if: (num:"5") > 2)` nests the (num:) macro inside the (if:) macro.

			If a macro can or should be given multiple values, separate them with commas. You can give the `(a:)` macro
			three numbers like so: `(a: 2, 3, 4)`. The final value may have a comma after it, or it may not - `(a: 2, 3, 4,)`
			is equally valid. Also, if you have a data value that's an array, string or dataset, you can "spread out" all
			of its values into the macro call by using the `...` operator: `(either: ...$array)` will act as if every value in
			$array was placed in the (either:) macro call separately

			Historical note:

			You might notice that the majority of Harlowe macros are not, strictly speaking, [macros in the computer-science sense](https://en.wikipedia.org/wiki/Macro_%28computer_science%29), but are
			more like functions. This is purely due to historical circumstance - the original Twine 1 story format, Jonah, was based on [TiddlyWiki](https://tiddlywiki.com/)'s engine,
			which features parameterised transclusions called "macros". These are closer to computer-science macros in that they actually transclude markup directly into the
			tiddler (TiddlyWiki's term for "passage"). Thus, only Harlowe command macros like (display:) can really be considered "proper" macros.

			#coding 1
		*/
		macroFront: macro.opener + before(macro.name),
		macroName: macro.name,
		
		/*
			This must be differentiated from macroFront
		*/
		groupingFront: "\\(" + notBefore(macro.name),
		
		twine1Macro,
		
		/*
			Property accesses
		*/

		validPropertyName,
		
		property,
		
		belongingProperty,
		
		possessiveOperator,
		
		belongingOperator,
		
		itsOperator,
		
		belongingItOperator,
		
		variable,

		tempVariable,
		
		hookName:
			"\\?(" + anyLetter + "+)\\b",
		
		/*
			Artificial types (non-JS primitives, semantic sugar)
		*/
		
		cssTime: "(\\d+\\.?\\d*|\\d*\\.?\\d+)(m?s)" + wb,
		
		colour: either(
			// Hue name
			either(
				"Red", "Orange", "Yellow", "Lime", "Green",
				"Cyan", "Aqua", "Blue", "Navy", "Purple",
				"Fuchsia", "Magenta","White", "Gray", "Grey", "Black", "Transparent"
			),
			// Hexadecimal
			"#[\\dA-Fa-f]{3}(?:[\\dA-Fa-f]{3})?"
		),

		// Data types
		datatype: either(
			"alnum", "alphanumeric", "any(?:case)?", "array", "bool(?:ean)?", "changer", "codehook", "colou?r", "const",
			"command", "dm", "data" + either("map","type","set"), "ds", "digit",
			"gradient", "empty", "even", "int" + notBefore('o') + "(?:eger)?", "lambda", "lowercase", "macro", "linebreak", "newline",
			"num(?:ber)?", "odd", "str(?:ing)?", "uppercase", "whitespace"
		) + wb,
		
		/*
			Natural types
		*/
		number,
		
		boolean: either("true","false") + wb,
		
		// Special identifiers
		identifier,
		itsProperty,
		belongingItProperty,
		
		// This sad-looking property is designed to disambiguate escaped quotes inside string literals.
		escapedStringChar:     "\\\\[^\\n]",
		
		singleStringOpener:    "'",
		doubleStringOpener:    '"',
		/*
			This doubled-up name is used for the special closers inside the "string" mode.
		*/
		singleStringCloser:    "'",
		doubleStringCloser:    '"',
		
		/*
			Macro operators
		*/
		
		is:        "is" + notBefore(mws + "not" + wb, mws + "an?" + wb, mws + "in" + wb, mws + "<", mws + ">") + wb,
		isNot:     "is" + mws + "not" + notBefore(mws + either("an?","in") + wb) + wb,
		isA:       "is" + mws + "an?" + wb,
		isNotA:    "is" + mws + "not" + mws + "an?" + wb,
		matches:   "matches" + wb,
		doesNotMatch: "does" + mws + "not" + mws + "match" + wb,
		// "matches" has no "contains" equivalent, but you can use "some of $c matches t"
		
		and:       "and" + wb,
		or:        "or"  + wb,
		not:       "not" + wb,
		
		inequality: "((?:is(?:" + mws + "not)?" + ws + ")*)(" + either("<(?!=)", "<=", ">(?!=)", ">=") + ")",
		
		isIn:            "is" + mws + "in" + wb,
		contains:        "contains" + wb,
		doesNotContain:  "does" + mws + "not" + mws + "contain" + wb,
		isNotIn:         "is" + mws + "not" + mws + "in" + wb,
		
		addition:          escape("+")      + notBefore("="),
		subtraction:       escape("-")      + notBefore("=","type"),
		multiplication:    escape("*")      + notBefore("="),
		division:          either("/", "%") + notBefore("="),
		
		spread:     "\\.\\.\\." + notBefore("\\."),
		
		to:         either("to" + wb, "="),
		into:       "into" + wb,
		making:     "making" + wb,
		where:      "where" + wb,
		when:       "when" + wb,
		via:        "via" + wb,
		each:       "each" + wb,
		augmentedAssign: either("\\+", "\\-", "\\*", "\\/", "%") + "=",

		bind:       "2?bind" + wb,
		typeSignature: escape("-type") + wb,

		incorrectOperator,

		PlainCompare: {
			comma: ",",
			/*
				Twine currently just uses HTML comment syntax for comments.
			*/
			commentFront: "<!--",
			commentBack: "-->",

			/*d:
				Style markup

				It's expected that you'd want to apply styles to your text – to italicise a word in dialogue,
				for example. You can do this with simple formatting codes that
				are similar to the double brackets of a link. Here is what's available to you:

				| Styling | Markup code | Result | HTML produced
				| --- | --- | --- | ---
				| Italics | `//text//` | <i>text</i> |`<i>text</i>`
				| Boldface | `''text''` | <b>text</b> |`<b>text</b>`
				| Strikethrough text | `~~text~~` | <s>text</s> | `<s>text</s>`
				| Emphasis | `*text*` | *text* |`<em>text</em>`
				| Strong emphasis | `**text**` | **text** |`<strong>text</strong>`
				| Superscript | `meters/second^^2^^` | meters/second<sup>2</sup> | `meters/second<sup>2</sup>`

				Emphasis and strong emphasis appear identical to italics and boldface by default (though they can be changed
				using CSS) and are offered for those with familiarity with the Markdown language. Italics and boldface are offered
				for those with familiarity with SugarCube, Twine 1, or TiddlyWiki.

				The alternative Markdown emphasis syntax `_text_` and `__text__` is not available. Harlowe reserves the use of the _
				character for temp variables.

				Example usage:
				```
				You //can't// be serious! I have to go through the ''whole game''
				again? ^^Jeez, Louise!^^
				```

				Details:
				You can nest these codes - `''//text//''` will produce ***bold italics*** - but they must nest
				symmetrically. `''//text''//` will not work.

				A larger variety of text styles can be produced by using the (text-style:) macro, attaching it to
				a text hook you'd like to style. And, furthermore, you can use HTML tags like `<mark>` as an additional
				styling option.

				#basics
			*/
			strikeOpener: "~~",
			italicOpener: "//",
			boldOpener: "''",
			supOpener: "^^",
			/*
				To avoid ambiguities between adjacent strong and em openers,
				these must be specified as separate front and back tokens
				with different precedence.
			*/
			strongFront: "**",
			strongBack: "**",
			emFront: "*",
			emBack: "*",

			/*d:
				Collapsing whitespace markup

				When working with macros, HTML tags and such, it's convenient for readability purposes to space and indent
				the text. However, this whitespace will also appear in the compiled passage text. You can get around this by
				placing the text between `{` and `}` marks. Inside, all runs of consecutive whitespace (line breaks, spaces)
				will be reduced to just one space.

				Example usage:
				```
				{
					This sentence
					will be
					(set: $event to true)
					written on one line
					with only single spaces.
				}
				```

				Details:

				If you wish to still have line breaks within the markup that won't be collapsed, you can use HTML `<br>` tags (see
				the HTML markup section for more information about raw HTML tags).

				You can nest this markup within itself - `{Good  { gumballs!}}` - but the inner pair won't behave any
				differently as a result of being nested.

				Text inside macro calls (in particular, text inside strings provided to macro) will not be collapsed.
				Neither will text *outputted* by macro calls, either - `{(print:"\n\n\n")}` will still print 3 newlines
				(see the String article for the meaning of the \n escape code),
				and `{(display:"Attic")}` will still display all of the whitespace in the "Attic" passage.

				Also, newlines inside the verbatim syntax will not be collapsed either.
				```
				{Thunder`
				`hound}
				```

				Note that Harlowe's default CSS already collapses consecutive spaces in a single line, but not vertical whitespace (which is converted to `<br>` elements).
				If you change it, using the `white-space` CSS property (such as by `white-space:break-spaces` in your story stylesheet),
				then the effects of this syntax in removing horizontal whitespace will become noticeable.

				If the markup contains a (replace:) command attached to a hook, the hook will still have its whitespace
				collapsed, even if it is commanded to replace text outside of the markup.

				You may apply this collapsing effect to specific hooks using the (collapse:) macro. In particular,
				if you wish for the entire passage's whitespace to collapse, consider using (change: ?passage) and (collapse:).

				If you only want to remove specific line breaks, consider the escaped line break markup.

				#whitespace 2
			*/
			collapsedFront: "{",
			collapsedBack: "}",
			groupingBack: ")",
		},
	};
	
	if (typeof module === 'object') {
		module.exports = Patterns;
	}
	else if (typeof define === 'function' && define.amd) {
		define('patterns', [], function () {
			return Patterns;
		});
	}
	// Loaded as a story format in TwineJS 2.3.
	else if (this && this.loaded) {
		this.modules || (this.modules = {});
		this.modules.Patterns = Patterns;
	}
	// Loaded in TwineJS 2.4.
	else {
		this.Patterns = Patterns;
	}
}).call(eval('this') || (typeof global !== 'undefined' ? global : window));

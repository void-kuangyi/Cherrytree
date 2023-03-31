'use strict';

const fs = require('fs');
const insensitiveName = (e) => (e + "").toLowerCase().replace(/-|_/g, "");
/*
	This extracts Harlowe macro and syntax metadata by reading
	/*d: delimited comments from the source files.
*/
const
	macroEmpty = /\(([\w\-\d]+):\)(?!`)/g,
	macroAliases = /Also known as: [^\n]+/,
	macroAddedIn = /Added in: (\d\.\d\.\d)/,
	macroAbstract = /-> [\w]+\n(?:Also known as: [^\n]+)?\n*((?:[^\n]+\n+)+)(?=(?:Example usage))/,
	categoryTag = /\s+#([a-z][a-z ]*[a-z])(?: (\d+))?/g,
	/*
		This matches a mixed-case type name, optionally plural, but not whenever
		it seems to be part of a macro name.
		Due to its commonality in English, "any" is not included.
	*/
	typeName = /([^\-`])\b(hookname|colour|variabletovalue|lambda|changer|metadata|command|gradient|string|bind(?! )|typedvar|codehook|custommacro|number|boolean|array|data(?:map|set|type))(s?)(?!\:\))\b/ig,
	
	Defs = function(props) {
		return Object.assign({
			defs: {},

			entries() {
				return Object.keys(this.defs).map(e=>[e,this.defs[e]]);
			},
			navLink(def) {
				return `<li><a href="#${def.anchor}">${def.name}</a></li>`;
			},
			output() {
				let outputElement = '', navElement = '';
				let currentCategory;

				Object.keys(this.defs).sort((left, right) => {
					const {category:leftCategory, categoryOrder:leftCategoryOrder} = this.defs[left];
					const {category:rightCategory, categoryOrder:rightCategoryOrder} = this.defs[right];

					/*
						Deprecated macros should be listed last.
					*/
					if (leftCategory === "deprecated") {
						return 1;
					}
					if (rightCategory === "deprecated") {
						return -1;
					}
					/*
						Otherwise, sort alphabetically, then by explicit order number.
					*/
					if (leftCategory !== rightCategory) {
						return (leftCategory || "").localeCompare(rightCategory || "");
					}
					if (leftCategoryOrder !== rightCategoryOrder) {
						if (isNaN(+leftCategoryOrder)) {
							return 1;
						}
						if (isNaN(+rightCategoryOrder)) {
							return -1;
						}
						return Math.sign(leftCategoryOrder - rightCategoryOrder);
					}
					return left.localeCompare(right);
				}).forEach((e) => {
					const def = this.defs[e];
					/*
						Add the category heading to the <nav> if we're in a new category.
					*/
					if (def.category !== currentCategory) {
						/*
							Add the terminating </ul> if a category has just ended.
						*/
						if (currentCategory) {
							navElement += "</ul>";
						}
						currentCategory = def.category;
						navElement += `<h6>${def.category}</h6><ul>`;
					}
					/*
						Output the definition to both the file and the <nav>
					*/
					outputElement += def.text;
					navElement += this.navLink(def);
				});

				return [outputElement, navElement];
			},
		}, props);
	},

	Appendix = new Defs({
		defName: "Appendix",
		defCode: "appendix",
		regExp: /^\s*Appendix: (.+?)\n/,

		definition({input, 0:title, 1:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title appendix_title' id=appendix_" + slugName + ">"
				+ "<a class='heading_link' href=#appendix_" + slugName + "></a>" + name + "</h2>\n");

			text = processTextTerms(
				text,
				name,
				{markupNames:true, macroNames:true}
			);

			this.defs[title] = { text, anchor: "appendix_" + slugName, name };
		},
	}),

	Changes = new Defs({
		defName: "Change log",
		defCode: "changes",
		regExp: /^### (\d\.\d\.\d[^:]*):/,

		definition({input, 0:title, 1:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title changes_title' id=changes_" + slugName + ">"
				+ "<a class='heading_link' href=#changes_" + slugName + "></a>" + name + "</h2>\n");

			this.defs[title] = { text: "\n"+text.trim()+"\n", anchor: "changes_" + slugName, name, categoryOrder: Object.keys(this.defs).length };
		},
	}),

	Introduction = new Defs({
		defName: "Introduction",
		defCode: "introduction",
		regExp: /^\s*Introduction (\d+): (.+?)\n/,

		definition({input, 0:title, 1:categoryOrder, 2:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title introduction_title' id=introduction_" + slugName + ">"
				+ "<a class='heading_link' href=#introduction_" + slugName + "></a>" + name + "</h2>\n");

			text = processTextTerms(
				text,
				name,
				{markupNames:true, macroNames:true}
			);

			this.defs[title] = { text, anchor: "introduction_" + slugName, name, categoryOrder };
		},
	}),

	Interface = new Defs({
		defName: "Editing and debugging",
		defCode: "interface",
		regExp: /^\s*Interface (\d+): (.+?)\n/,

		definition({input, 0:title, 1:categoryOrder, 2:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title interface_title' id=interface_" + slugName + ">"
				+ "<a class='heading_link' href=#interface_" + slugName + "></a>" + name + "</h2>\n");

			text = processTextTerms(
				text,
				name,
				{markupNames:true, macroNames:true}
			);

			this.defs[title] = { text, anchor: "interface_" + slugName, name, categoryOrder };
		},
	}),

	Markup = new Defs({
		defName: "Passage markup",
		defCode: "markup",
		regExp: /^\s*([\w ]+) markup\n/,

		navLink(def) {
			// Change this for 4.0.0
			const isNew = [].includes(def.name);

			return `<li><a href="#${def.anchor}" ${isNew ? "class='nav_new'": ""}>${def.name}</a></li>`;
		},

		definition({input, 0:title, 1:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title markup_title' id=markup_" + slugName + ">"
				+ "<a class='heading_link' href=#markup_" + slugName + "></a>" + title + "</h2>\n");
			const {1:category, 2:categoryOrder} = (categoryTag.exec(text) || {});

			text = processTextTerms(
				text,
				name,
				{markupNames:true, macroNames:true}
			);
			this.defs[title] = { text, anchor: "markup_" + slugName, name, category, categoryOrder };
		},
	}),

	Type = new Defs({
		defName: "Types of data",
		defCode: "type",
		regExp: /^\s*([\w]+) data\n/,

		navLink(def) {
			// Change this for 4.0.0
			const isNew = [].includes(def.name);

			return `<li><a href="#${def.anchor}" ${isNew ? "class='nav_new'": ""}>${def.name}</a></li>`;
		},

		definition({input, 0:title, 1:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title type_title' id=type_" + slugName + ">"
				+ "<a class='heading_link' href=#type_" + slugName + "></a>" + title + "</h2>\n");
			const {1:category, 2:categoryOrder} = (categoryTag.exec(text) || {});

			text = processTextTerms(
				text,
				name,
				{typeNames: true, macroNames:true}
			);

			this.defs[title] = { text, anchor: "type_" + slugName, name, category, categoryOrder };
		},
	}),

	Keyword = new Defs({
		defName: "Special keywords",
		defCode: "keyword",
		regExp: /^\s*([\w]+) -> ([\w]+)\n/,

		navLink(def) {
			const isNew = (def.addedIn === "4.0.0");

			return `<li><a href="#${def.anchor}" ${isNew ? "class='nav_new'": ""}>${def.name}</a>
				<span class='nav_macro_return_type cm-harlowe-3-macroName-${def.returnType.toLowerCase()}'>${def.returnType}</span>${
					def.aka.length ? `<div class='nav_macro_aka'>${def.aka.join(', ')}</div>`
					: ''
				}</li>`;
		},

		definition({input, 0:title, 1:name, 2:returnType}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			const aka = ((macroAliases.exec(input) || [''])[0].match(/\w+$/) || []) || [];
			let text = input.trim().replace(title, "\n<h2 class='def_title keyword_title' id=keyword_" + slugName + ">"
				+ aka.map(e => "<a id=keyword_" + e + "></a>").join('')
				+ "<a class='heading_link' href=#keyword_" + slugName + "></a>"
				+ name + " keyword</h2>\n\n"
				+ "<h3>" + name + " <span class=macro_returntype>&rarr;</span> <i>" + returnType + "</i></h3>\n");

			text = processTextTerms(
				text,
				name,
				{typeNames: true, macroNames:true}
			);
			const addedIn = ((macroAddedIn.exec(input) || [])[1] || '');

			this.defs[title] = { text, anchor: "keyword_" + slugName, name, returnType, addedIn, aka };
		},
	}),

	PassageTag = new Defs({
		defName: "Special passage tags",
		defCode: "passagetag",
		regExp: /^\s*([\w\-]+) tag\n/,

		definition({input, 0:title, 1:name}) {
			const slugName =  name.replace(/\s/g,'-').toLowerCase();
			let text = input.trim().replace(title, "\n<h2 class='def_title passagetag_title' id=passagetag_" + slugName + ">"
				+ "<a class='heading_link' href=#passagetag_" + slugName + "></a>" + title + "</h2>\n");
			const categoryOrder = (categoryTag.exec(text) || {})[2];

			text = processTextTerms(
				text,
				name,
				{typeNames: true, macroNames:true}
			);

			this.defs[title] = { text, anchor: "passagetag_" + slugName, name, categoryOrder };
		},
	}),

	Macro = new Defs({
		defName: "List of macros",
		defCode: "macro",
		regExp: /^\s*\(([\w\-\d]+):([\s\w\.\,\[\]]*)\) -> ([\w]+)/,

		navLink(def) {
			const isNew = (def.addedIn === "4.0.0");

			return `<li><a href="#${def.anchor}" ${isNew === "3.3.0" ? "class='nav_new'": ""}>(${def.name}:<span class='nav_macro_sig'>${def.sig}</span>)</a>
				<span class='nav_macro_return_type cm-harlowe-3-macroName-${def.returnType.toLowerCase()}'>${def.returnType}</span>${
					def.aka.length ? `<div class='nav_macro_aka'>${def.aka.map(e => `(${e}:)`).join(', ')}</div>`
					: ''
				}</li>`;
		},
		/*
			Write out a macro title, which is simply "The (name:) macro",
			but with an id that allows the element to be used as an anchor target.
		*/
		title: (name, aka) =>
			"\n<h2 class='def_title macro_title' id=macro_" + name.toLowerCase() + ">" +
				aka.map(e => "<a id=macro_" + e + "></a>").join('') +
				"<a class='heading_link' href=#macro_" + name.toLowerCase() + "></a>The (" + name + ": ) macro</h2>\n",
		/*
			Write out a parameter signature, highlighting the pertinent parts:
			* Type names
			* "Optional" brackets
			* "Rest" ellipsis
			...with relevant HTML.
		*/
		parameterSignature: (sig) =>
			sig
				// Highlight the optional syntax
				.replace(/([\[\]])/g,  "<span class=parameter_optional>\\$1</span>")
				// Highlight the rest syntax
				.replace(/\.{3}/g, "<span class=parameter_rest>...</span>"),
		/*
			Write out the macro's signature as the following structures:
			* A <h2> tag anchored to "macro_" + the macro's name.
			* The macro's tag, containing...
			* Its parameter signature.
			* Then, afterward, a return type signature.
		*/
		signature: (name, sig, returnType) =>
			"\n<h3 class=macro_signature>" +
				"(" + name + ": <i>" +
				Macro.parameterSignature(sig) +
				"</i>) <span class=macro_returntype>&rarr;</span> <i>" +
				returnType +
				"</i></h3>\n",

		definition({input, 0:title, 1:name, 2:sig, 3:returnType}) {
			const aka = ((macroAliases.exec(input) || [''])[0].match(macroEmpty) || []).map(e=> (new RegExp(macroEmpty).exec(e) || [])[1]) || [];
			let text = input.trim()
				/*
					Convert the title signature into an anchor and an augmented parameter signature.
				*/
				.replace(title, Macro.title(name, aka) + Macro.signature(name, sig, returnType));

			const {1:category, 2:categoryOrder} = (categoryTag.exec(text) || {});

			const abstract = ((macroAbstract.exec(input) || [])[1] || '').replace(/\n/g, ' ');
			const addedIn = ((macroAddedIn.exec(input) || [])[1] || '');

			text = processTextTerms(text, name, {typeNames: true, macroNames:true});
			
			this.defs[title] = { text, anchor: "macro_" + name.toLowerCase(), name, category, categoryOrder, sig, returnType, abstract, addedIn, aka };
		},

		/*
			This produces a 'shortened' defs object, where each definition has only these values (importantly, not the text), and each alias has its own copy of the definition.
		*/
		shortDefs() {
			return Object.keys(this.defs).reduce((a,e)=>{
				let {name, sig, returnType, aka, abstract, anchor, category, categoryOrder} = this.defs[e];
				/*
					Make the name insensitive, so that it can be referenced without its 'canonical' punctuation.
				*/
				const data = {name, sig, returnType, aka, abstract, anchor, category, categoryOrder};
				a[insensitiveName(name)] = data;
				aka.map(insensitiveName).forEach(alias => a[alias] = data);
				return a;
			},{});
		}
	});

/*
	Convert various structures or terms in the passed-in body text
	into hyperlinks to their definitions, etc.
	(But don't link terms more than once, or link the title term.)
*/
function processTextTerms(text, name, allow) {
	allow = allow || {};
	/*
		A record of which names were hyperlinked.
		As a rule, only hyperlink names once each per definition.
	*/
	const
		typeNamesLinked = [],
		markupNamesLinked = [],
		headingMatch = /<h2[^]+?<\/h2>/g.exec(text);
	
	const linkFn = (name, type, text = name) => `<a href='#${type}_${name.toLowerCase()}'>${text}</a>`;

	text =
		/*
			Exclude the heading from the forthcoming replacements by concatenating it
			separately.
		*/
		text.replace(headingMatch[0], '\ufeff')
		/*
			Remove the category tag
		*/
		.replace(categoryTag,'')

		/*
			Convert specific markup names into hyperlinks.
		*/
		.replace(/([^\-\w])(whitespace)\b/ig, (text, $1, $2) => {
			if (!allow.markupNames) {
				return text;
			}
			/*
				...but don't hyperlink references to this own markup.
				(This targets mixed-case singular and plural.)
			*/
			if ($2.toLowerCase() === name.toLowerCase()) {
				return text;
			}
			if (markupNamesLinked.indexOf($2) === -1) {
				markupNamesLinked.push($2);
				return $1 + linkFn($2,"markup");
			}
			return text;
		})
		/*
			Convert type names into hyperlinks.
		*/
		.replace(typeName, (text, preceding, matchName, plural) => {
			if (!allow.typeNames) {
				return text;
			}
			/*
				Don't match if the preceding character is '-' or "(" (such as in (text-colour:) or (dataset:))
			*/
			if (["-","("].indexOf(preceding) >-1) {
				return text;
			}
			/*
				Don't hyperlink references to this own type.
				(This targets mixed-case singular and plural.)
			*/
			if (matchName.toLowerCase() === name.toLowerCase()) {
				return text;
			}
			if (typeNamesLinked.indexOf(matchName) === -1) {
				typeNamesLinked.push(matchName);
				return preceding + linkFn(matchName, "type", matchName + plural);
			}
			return text;
		})
		/*
			Convert other macro definitions into hyperlinks.
		*/
		.replace(macroEmpty, (text, $1) => {
			if (!allow.macroNames) {
				return text;
			}
			/*
				...but don't hyperlink references to this own macro.
				(e.g. don't hyperlink (goto:) in the (goto:) article.)
			*/
			if ($1.toLowerCase() === name.toLowerCase()) {
				return text;
			}
			return linkFn($1,"macro","(" + $1 + ":)");
		})
		/*
			Convert the minor headings into <h4> elements.
		*/
		.replace(/\n([A-Z][\w\,\?\s\d]+:)\n/g,"\n#### $1\n")
		/*
			Convert "Added in" lines to italics
		*/
		.replace(/\n\s+(Added in: [^\n]+)/g, "\n<aside>$1</aside>")
		/*
			Reinsert the heading
		*/
		.replace('\ufeff', headingMatch[0]);
	return text;
}

/*
	Read the definitions from every JS and MD file.
*/
let rr = require('fs-readdir-recursive');
let paths = rr('js/').map(e=>'js/'+e)
	.concat(rr('miscdocs/').map(e=>'miscdocs/'+e))
	.concat('README.md');

paths.forEach(function(path) {
	let file = fs.readFileSync(path, {encoding:'utf8'});
	let defs;
	// .md files should be treated as entire single definitions
	if (path === "README.md") {
		// Change this for 4.0.0
		defs = file.match(/### 3\.3\.\d[^]*?\n(?=###[^#])/g);
	} else if (path.endsWith('.md')) {
		defs = [file];
	} else {
		// Extract definitions from the JS file
		defs = file.match(/\/\*d:[^]*?\*\//g);
		if (!defs) {
			return;
		}
		defs = defs.map((e) => {
			// Remove the /*d: and */ markers, whitespace, and nonessential tabs.
			e = e.slice(4,-2);
			// Obtain the default indentation based on the first line.
			const tabs = /\t+/.exec(e)[0].length;
			return e.replace(RegExp('\\n\\t{' + tabs + '}','g'),'\n').trim();

		});
	}
	defs.forEach((defText) => {
		let match;
		[Introduction,Interface,Appendix,Markup,Macro,Type,Keyword,Changes,PassageTag].forEach(e=> {
			if ((match = defText.match(e.regExp))) {
				e.definition(match);
			}
		});
	});
});
// Order of this object determines the overall document order.
module.exports = {Introduction, Interface, Markup, Macro, Keyword, PassageTag, Type, Changes, Appendix};

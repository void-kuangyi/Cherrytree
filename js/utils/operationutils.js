"use strict";
define('utils/operationutils', ['utils/naturalsort','utils', 'internaltypes/twineerror', 'patterns'],
	(NaturalSort, {impossible, nth, permutations, plural}, TwineError, {validPropertyName}) => {
	
	/*
		Some cached strings to save a few characters when this is compiled. Yes, these are Hungarian Notated... well spotted.
	*/
	const sObject = "object",
		sBoolean = "boolean",
		sString = "string",
		sNumber = "number",
		sFunction = "function";
	/*
		First, a quick shortcut to determine whether the
		given value is an object (i.e. whether the "in"
		operator can be used on a given value).
	*/
	function isObject(value) {
		return !!value && (typeof value === sObject || typeof value === sFunction);
	}
	const {isArray} = Array;

	/*
		Unlike $.isPlainObject, this checks if the object is directly descended from Object.prototype.
		Pure objects are used for minor data that really, really doesn't need to be its own class:
		HookSet property ranges, type descriptor patterns, changer params, etc.
	*/
	function isPureObject(obj) {
		return obj && Object.getPrototypeOf(obj) === Object.prototype;
	}
	
	/*
		Next, a quick function used for distinguishing the types of collections
		native to TwineScript.
		Currently (Jan 2021) only used by Operations, VarRef and data structure macros.
	*/
	function collectionType(value) {
		return isArray(value) ? "array" :
			value instanceof Map ? "datamap" :
			value instanceof Set ? "dataset" :
			typeof value === sString ? sString :
			value && typeof value === sObject ? sObject :
			/*
				If it's not an object, then it's not a collection. Return
				a falsy string (though I don't condone using this function in
				Boolean position).
			*/
			"";
	}

	/*
		Used to retrieve any unstorable value from a data structure.
		Currently (Jan 2022) only used by VarRef and TypedVar.
	*/
	function unstorableValue(value) {
		return (value?.TwineScript_Unstorable && value)
			|| (isArray(value) && value.find(unstorableValue))
			|| (value instanceof Map && [...value.values()].find(unstorableValue))
			|| (value instanceof Set && [...value].find(unstorableValue));
	}
	
	/*
		Next a quick function that determines if a datamap property name is valid.
		This requires that the datamap itself be passed in.
		Currently (Jan 2022) only used by VarRef, metadata macros, and data structure macros.
	*/
	function isValidDatamapName(map, name) {
		if(!(map instanceof Map)) {
			impossible('isValidDatamapName','called with non-Map');
		}
		/*
			This really shouldn't be possible, but, well...
		*/
		if (TwineError.containsError(name)) {
			return name;
		}
		/*
			The computed variable property syntax means that basically
			any value can be used as a property key. Currently, we only allow strings
			and numbers to be used.
			(This kind of defeats the point of using ES6 Maps, though...)
		*/
		if(typeof name !== sString && typeof name !== sNumber) {
			return TwineError.create(
				"property",
				"Only strings and numbers can be used as data names for "
				+ objectName(map) + ", not " + objectName(name) + "."
			);
		}
		/*
			To avoid confusion between types, it is not permitted to make OR REFERENCE
			a number data key if a similar string key is present, and vice-versa.
		*/
		const otherName = (typeof name === sString ? +name : ''+name);
		
		/*
			If the name was a non-numeric string, otherName should be NaN.
			Ignore it if it is.
		*/
		if(!Number.isNaN(otherName) && map.has(otherName)) {
			return TwineError.create(
				"property",
				"You mustn't use both " + objectName(name) + " and "
				+ objectName(otherName) + " as data names in the same datamap."
			);
		}
		/*
			Those are all the tests.
		*/
		return true;
	}

	/*
		A shortcut to determine whether a given value should have
		sequential collection functionality (e.g. Array, String, HookSet).
		Currently (Jan 2022) only used by VarRef.
	*/
	function isSequential(value) {
		return typeof value === sString || isArray(value) || typeof value.hooks === sFunction;
	}
	/*
		Now, a function to clone arbitrary values.
		This is only a shallow clone, designed for use by VarRef.set()
		to make a distinct copy of an object after assignment.
		Used everywhere.
	*/
	function clone(value) {
		if (!isObject(value)) {
			return value;
		}
		/*
			If it has a custom TwineScript clone method, use that.
		*/
		if (typeof value.TwineScript_Clone === sFunction) {
			return value.TwineScript_Clone();
		}
		/*
			If it's an array, the old standby is on call.
		*/
		if (isArray(value)) {
			return [...value];
		}
		/*
			For ES6 collections, we can depend on the constructors.
		*/
		if (value instanceof Map) {
			return new Map(value);
		}
		if (value instanceof Set) {
			return new Set(value);
		}
		/*
			If it's a function, Function#bind() makes a copy without altering its 'this'.
		*/
		if (typeof value === sFunction) {
			return Object.assign(value.bind(), value);
		}
		/*
			If it's a plain object or null object, you can rely on Object.assign().
		*/
		switch (Object.getPrototypeOf(value)) {
			case Object.prototype:
				return { ...value };
			case null:
				return Object.assign(Object.create(null), value);
		}
		/*
			If we've gotten here, something unusual has been passed in.
		*/
		impossible("OperationUtils.clone", "The value " + value + " cannot be cloned!");
		return value;
	}
	
	/*
		Most Harlowe objects have an ObjectName method which supplies a name
		string to the error message facilities.
	*/
	/*
		This helper function produces a truncated list of the first few elements, followed by 'and X other items'.
	*/
	function truncatedList(list, maxLength, itemNoun, itemNameFn) {
		let ret = '', i = 0;
		while (ret.length <= maxLength && i < list.length) {
			/*
				Array listings should list the full objectName of each value,
				but datamaps should only list their string keys, without "a string named".
				As such, this function takes a custom item-name conversion function.
			*/
			const item = itemNameFn(list[i]);
			if (item.length + ret.length <= maxLength) {
				ret += (i > 0 && i === list.length-1 ? " and " : '') + item + (i < list.length-1 ? ", " : '');
			} else {
				ret += (i > 0 ? " and " : '') + plural(list.length - i, (i > 0 ? 'other ' : '') + itemNoun);
				break;
			}
			i+=1;
		}
		return ret;
	}
	function objectName(obj) {
		if (isObject(obj) && "TwineScript_ObjectName" in obj) {
			return obj.TwineScript_ObjectName;
		}
		if (isArray(obj)) {
			if (obj.length === 0) {
				return "an empty array";
			}
			return `an array (with ` + truncatedList(obj, 48, "item", objectName) + ")";
		}
		if (obj instanceof Map) {
			if (obj.size === 0) {
				return "an empty datamap";
			}
			return `a datamap (with ` + truncatedList([...obj.keys()], 48, "dataname",
				/*
					Someday, non-string datanames may be possible. As such, toSource is used instead of
					JSON.stringify.
				*/
				toSource) + ")";
		}
		if (obj instanceof Set) {
			if (obj.size === 0) {
				return "an empty dataset";
			}
			return `a dataset (with ` + truncatedList([...obj.values()], 48, "item", objectName) + ")";
		}
		if (typeof obj === sString) {
			if (obj.length === 0) {
				return "an empty string";
			}
			/*
				This uses the actual code point length of the string, even though similar checks above do not (to
				save time).
			*/
			let codePoints = [...obj];
			if (codePoints.length > 48) {
				return `a ${codePoints.length}-character string starting with ${JSON.stringify(codePoints.slice(0,48).join(''))}`;
			}
			return `the string ${JSON.stringify(obj)}`;
		}
		return typeof obj === sBoolean ? "the boolean value '" + obj + "'"
			: typeof obj === sNumber ? 'the number ' + JSON.stringify(obj)
			: obj === undefined ? "an empty variable"
			: "...whatever this is";
	}
	/*
		The TypeName method is also used to supply error messages relating to type signature
		checks. Generally, a Harlowe datatype prototype should be supplied to this function,
		compared to objectName, which typically should receive instances.
		
		Alternatively, for Javascript types, the global constructors String, Number, Boolean,
		Map, Set, and Array may be given.
		
		Finally, certain "type descriptor" objects are used by Macros, and take the form
			{ pattern: {String, innerType: {Array|Object|String} }
		and these should be warmly received as well.
	*/
	function typeName(obj) {
		const plain = isPureObject(obj);
		if (plain && obj.innerType) {
			/*
				Some type descriptors have a special name that isn't JUST the innerType's
				typeName (to my knowledge, just lambdas with specific clauses).
			*/
			if (obj.typeName) {
				return obj.typeName;
			}
			if (obj.pattern === "insensitive set") {
				/*
					Rather than fully represent the set of strings,
					this simply represents the general type.
				*/
				return "a case-insensitive string name";
			}
			if (obj.pattern === "either") {
				if(!isArray(obj.innerType)) {
					impossible("typeName",'"either" pattern had non-array inner type');
				}
				
				return obj.innerType.map(typeName).join(" or ");
			}
			else if (obj.pattern === "optional") {
				return "(optional) " + typeName(obj.innerType);
			}
			return typeName(obj.innerType);
		}
		/*
			Number and patterns ranges have more precise descriptions.
		*/
		else if (plain && obj.pattern === "range") {
			/*
				Custom patterns have special names which should be used for self-description.
			*/
			if (obj.name) {
				return obj.name;
			}
			const {min,max} = obj;
			return "a" +
				// This construction assumes that the minimum will always be 0, 1 or >0.
				(
					min > 0 ? " positive" : ""
				) + (
					obj.integer ? " whole" : ""
				) + " number" + (
					min === 0 ? " between 0 and " + max :
					max < Infinity ? " up to " + max : ""
				);
		}
		return (
			/*
				Second, if it's a global constructor, simply return its name in lowercase.
			*/
			(   obj === String ||
				obj === Number ||
				obj === Boolean)  ? "a " + typeof obj()
			:   obj === parseInt  ? "a whole number"
			:   obj === Map       ? "a datamap"
			:   obj === Set       ? "a dataset"
			:   obj === Array     ? "an array"
			/*
				Otherwise, defer to the TwineScript_TypeName, or TwineScript_ObjectName
			*/
			: (isObject(obj) && "TwineScript_TypeName" in obj) ? obj.TwineScript_TypeName
			: objectName(obj)
		);
	}

	/*
		This small function, unlike typeName, returns an internal ID corresponding to the data type of its input.
		It is used exclusively for obtaining type IDs of data, so that debug mode can properly colour
		<tw-expression>s with their returned type.
	*/
	function typeID(obj) {
		const jsType = typeof obj;
		if ([sBoolean,sString,sNumber].includes(jsType)) {
			return jsType;
		}
		if (isArray(obj)) {
			return "array";
		}
		if (obj instanceof Map) {
			return "datamap";
		}
		if (obj instanceof Set) {
			return "dataset";
		}
		return obj.TwineScript_TypeID || "";
	}

	/*
		This is used to convert all possible user-storable data back into an executable
		code serialisation, for use by Debug Mode and the (source:) macro.
		This should never receive a TwineError.
		Used everywhere.
	*/
	const mapEntriesSorter = (a,b) => ([a[0],b[0]].sort(NaturalSort("en"))[0] === a[0] ? -1 : 1);
	function toSource(obj, isProperty) {
		let e = TwineError.containsError(obj);
		if (e) {
			impossible("toSource","received a TwineError: " + e.message);
		}
		if (typeof obj.TwineScript_ToSource === sFunction) {
			return obj.TwineScript_ToSource();
		}
		/*
			These property ranges, "1stto2ndlast" etc., are saved by HookSets,
			and need to be serialised with them.
		*/
		if (isPureObject(obj) && "first" in obj && "last" in obj) {
			return (obj.first < 0 ? (obj.first !== -1 ? nth(-obj.first) : "") + "last" : nth(obj.first+1)) + "to"
				+ (obj.last < 0 ? (obj.last !== -1 ? nth(-obj.last) : "") + "last" : nth(obj.last+1));
		}
		/*
			The following three heavily leverage the way JS arrays serialise themselves
			automatically.
		*/
		if (isArray(obj)) {
			let ret = '';
			for (let elem of obj) {
				ret += (!ret ? "(a:" : ',');
				/*
					The conversion from 1-based to 0-based properties is not far under Harlowe's surface,
					so it must be reversed here.
				*/
				if (isProperty === 'property') {
					ret += elem+(elem>0);
				} else {
					ret += toSource(elem);
				}
			}
			return ret + (!ret ? "(a:)" : ')');
		}
		if (obj instanceof Map) {
			const entries = Array.from(obj.entries()).sort(mapEntriesSorter);
			let ret = '';
			for (let [k,v] of entries) {
				ret += (!ret ? "(dm:" : ',') + toSource(k) + "," + toSource(v);
			}
			return ret + (!ret ? "(dm:)" : ')');
		}
		if (obj instanceof Set) {
			return "(ds:" + Array.from(obj).sort(NaturalSort("en")).map(toSource) + ")";
		}
		/*
			Numbers used as property indices need to be converted to "nth".
		*/
		if (typeof obj === sNumber && isProperty === 'property') {
			return obj < 0 ? obj === -1 ? "last" : nth(-obj) + "last" : nth(obj+1);
		}
		/*
			String properties should, usually, be string literals wrapped in parens, but if it's
			already a valid property name, don't do so.
		*/
		if (typeof obj === sString && isProperty === 'property') {
			if (!RegExp(validPropertyName).test(obj)) {
				return "(" + JSON.stringify(obj) + ")";
			}
			return obj;
		}
		/*
			What remains should be only JS primitives.
		*/
		return JSON.stringify(obj);
	}
	
	/*
		As TwineScript uses pass-by-value rather than pass-by-reference
		for all objects, it must also use compare-by-value for objects as well.
		This function implements the "is" operation.
	*/
	function is(l, r) {
		/*
			For primitives, === is sufficient.
		*/
		if (typeof l !== sObject && typeof r !== sObject) {
			return l === r;
		}
		/*
			For Arrays, compare every element and position of one
			with the other.
		*/
		if (isArray(l) && isArray(r)) {
			/*
				A quick check: if they vary in length, they already fail.
			*/
			if (l.length !== r.length) {
				return false;
			}
			return l.every((element, index) => is(r[index], element));
		}
		/*
			For Maps and Sets, simply reduce them to Arrays.
		*/
		if (l instanceof Map && r instanceof Map) {
			// Don't forget that Map.prototype.entries() returns an iterator!
			return is(
				// Since datamaps are supposed to be unordered, we must sort these arrays
				// so that different-ordered maps are regarded as equal.
				Array.from(l.entries()).sort(),
				Array.from(r.entries()).sort()
			);
		}
		if (l instanceof Set && r instanceof Set) {
			return is([...l], [...r]);
		}
		/*
			For TwineScript built-ins, use the TwineScript_is() method to determine
			uniqueness.
		*/
		if (l && typeof l.TwineScript_is === sFunction) {
			return l.TwineScript_is(r);
		}
		/*
			For plain objects (such as Changer params), compare structurally.
		*/
		if (l && typeof l === sObject && r && typeof r === sObject
				&& isPureObject(l) && isPureObject(r)) {
			return is(
				Object.getOwnPropertyNames(l).map(name => [name, l[name]]),
				Object.getOwnPropertyNames(r).map(name => [name, r[name]])
			);
		}
		return Object.is(l, r);
	}
	
	/*
		As the base function for Operations.contains,
		this implements the "x contains y" and "y is in x" keywords.
		This is placed outside so that Operation.isIn can call it.
		Only used by Operations.
	*/
	function contains(container,obj) {
		/*
			For containers, compare the contents (if it can hold objects)
			using the above is() algorithm rather than by JS's typical by-reference
			comparison.
		*/
		if (container || container === "") {
			if (typeof container === sString) {
				if (typeof obj !== sString) {
					return TwineError.create("operation", objectName(container) + " can only contain strings, not " + objectName(obj) + ".");
				}
				return container.includes(obj);
			}
			if(isArray(container)) {
				return container.some((e) => is(e, obj));
			}
			/*
				For Sets and Maps, check that the key exists.
			*/
			if (container instanceof Set || container instanceof Map) {
				return Array.from(container.keys()).some(e => is(e, obj));
			}
		}
		/*
			Default: produce an error.
		*/
		return TwineError.create("operation", objectName(container) + " cannot contain any values, let alone " + objectName(obj));
	}

	/*
		This is the base function for Operations.isA and Operations.typifies, the latter being a purely internal
		reversal used by elided comparison compilation.
		Only used by Operations.
	*/
	function isA(l,r) {
		/*
			Only datatype values can be used as the right side of "is a".
		*/
		if (typeof r.TwineScript_IsTypeOf === sFunction) {
			return r.TwineScript_IsTypeOf(l);
		}
		return TwineError.create("operation", "\"is a\" should only be used to compare type names, not " + objectName(r) + ".");
	}

	/*
		Single-value pattern-matching is implmented by this function. It's essentially the same as structural equality
		checks, except that when datatype names appears, the other side is compared using "is a". This allows
		them to act as loose matches for values.
	*/
	function matches(l, r) {
		/*
			Mainly for readability, the datatype checks are done first. Note that if both sides are datatypes,
			then this should return true if either side matches the other.
		*/
		let datatypeMatch = false;
		if (l && typeof l.TwineScript_IsTypeOf === sFunction) {
			/*
				The only TwineScript_IsTypeOf havers that can produce an error are (p-opt:) and its ilk.
				Nevertheless, we must be prepared for it.
			*/
			const isTypeOf = l.TwineScript_IsTypeOf(r);
			if (TwineError.containsError(isTypeOf)) {
				return isTypeOf;
			}
			datatypeMatch |= isTypeOf;
		}
		if (r && typeof r.TwineScript_IsTypeOf === sFunction) {
			const isTypeOf = r.TwineScript_IsTypeOf(l);
			if (TwineError.containsError(isTypeOf)) {
				return isTypeOf;
			}
			datatypeMatch |= isTypeOf;
		}
		if (datatypeMatch) {
			return true;
		}
		/*
			All subsequent code resembles is(), because matching is close
			to equality except where datatype values are concerned.
		*/
		if (isArray(l) && isArray(r)) {
			/*
				In order to properly compare spread datatypes, each value of each side must
				be compared in non-uniform fashion to values on the other side.
			*/
			let leftInd = 0, rightInd = 0, ret = true;
			while (ret && leftInd < l.length && rightInd < r.length) {
				let left = l[leftInd], right = r[rightInd];
				/*
					The matching algorithm is as follows:
					If the two compared values don't match:
					- if neither is a rest, fail
					- if one is a rest, advance past it
					Otherwise:
					- advance past each non-rest
				*/
				if (left.rest) {
					while (rightInd < r.length && matches(left, right)) {
						rightInd += 1;
						right = r[rightInd];
					}
					leftInd += 1;
				} else if (right.rest) {
					while (leftInd < l.length && matches(left, right)) {
						leftInd += 1;
						left = l[leftInd];
					}
					rightInd += 1;
				} else if (!matches(left, right)) {
					ret = false;
				} else {
					leftInd += 1;
					rightInd += 1;
				}
			}
			return ret && leftInd >= l.length && rightInd >= r.length;
		}
		/*
			Again, Maps are reduced to arrays for comparison purposes.
		*/
		if (l instanceof Map && r instanceof Map) {
			// Don't forget that Map.prototype.entries() returns an iterator!
			return matches(
				// Since datamaps are supposed to be unordered, we must sort these arrays
				// so that different-ordered maps are regarded as equal.
				Array.from(l.entries()).sort(),
				Array.from(r.entries()).sort()
			);
		}
		if (l instanceof Set && r instanceof Set) {
			/*
				This is a little trickier... we need to see if the right side has any permutation that
				matches the left side.
			*/
			l = [...l];
			return permutations(...r).some(r => matches(l,r));
		}
		/*
			From here, all the data structures are covered, so we can just invoke is() directly.
		*/
		return is(l,r);
	}
	
	/*
		This calls the slice() method of the given sequence, but takes TwineScript (subarray:)
		and (substring:) indices (which are 1-indexed), converting them to those preferred by JS.
		Only used by data structure macros, VarRef and value macros.
	*/
	function subset(sequence, a, b) {
		/*
			A zero index or a NaN index is an error.
		*/
		if (!a || !b) {
			return TwineError.create(
				"macrocall",
				"The sub" + collectionType(sequence) + " index value must not be " + (a && b) + "."
			);
		}
		/*
			As mentioned elsewhere in Operations, JavaScript's irksome UCS-2 encoding for strings
			means that, in order to treat surrogate-pair characters as 1 character in 1 position,
			they must be converted to and from arrays whenever indexing or .slice() is performed.
		*/
		const isString = typeof sequence === sString;
		if (isString) {
			sequence = Array.from(sequence);
		}
		/*
			To simplify things, convert negative indices into positive ones.
		*/
		if (a < 0) {
			/*
				If the negative index overshoots the end, clamp it to the start instead of making an error.
			*/
			a = Math.max(0, sequence.length + a + 1);
		}
		if (b < 0) {
			b = Math.max(0, sequence.length + b + 1);
		}
		/*
			For now, let's assume descending ranges are intended, and support them.
		*/
		if (a > b) {
			/*
				For this recursive call, the original string (if string it was) need to be passed in, not the
				array-of-chars that was produced above.
			*/
			return subset(arguments[0], b, a);
		}
		/*
			As the positive indices are 1-indexed, we shall subtract 1 from a if a is positive.
			But, as they're inclusive, b shall be left as is.
		*/
		const ret = sequence.slice(a > 0 ? a - 1 : a, b).map(clone);
		/*
			Now that that's done, convert any string sequence back into one.
		*/
		if (isString) {
			return ret.join('');
		}
		return ret;
	}

	/*
		This provides a safe means of serialising Arrays, Maps, Sets, and primitives into user-presented HTML.
		This is usually called by such a value appearing in passage prose, or within a (print:) command.
		Only used by Section and command macros.
	*/
	function printBuiltinValue(value) {
		/*
			If an error was passed in, return the error now.
		*/
		if (TwineError.containsError(value)) {
			return value;
		}
		if (value && typeof value.TwineScript_Print === sFunction) {
			return value.TwineScript_Print();
		}
		else if (value instanceof Map) {
			/*
				In accordance with arrays being "pretty-printed" to something
				vaguely readable, let's pretty-print datamaps into HTML tables.
				
				First, convert the map into an array of key-value pairs.
			*/
			value = Array.from(value.entries());
			if (TwineError.containsError(value)) {
				return value;
			}
			return value.reduce((html, [pair1, pair2]) =>
				/*
					Print each value, calling printBuiltinValue() on
					each of them. Notice that the above conversion means
					that none of these pairs contain error.
				*/
				html + "<tr><td>`" +
					printBuiltinValue(pair1) +
					"`</td><td>`" +
					printBuiltinValue(pair2) +
					"`</td></tr>",
				"<table class=datamap>") + "</table>";
		}
		else if (value instanceof Set) {
			/*
				Sets are close enough to arrays that we might as well
				just pretty-print them identically.
			*/
			return Array.from(value.values()).map(printBuiltinValue) + "";
		}
		else if (isArray(value)) {
			return value.map(printBuiltinValue) + "";
		}
		else if (value && typeof value.jquery === sString) {
			return value;
		}
		/*
			If it's an object we don't know how to print, emit an error
			instead of [object Object].
		*/
		else if (isObject(value)) {
			return TwineError.create("unimplemented", "I don't know how to print this value yet.");
		}
		/*
			At this point, primitives have safely fallen through.
		*/
		return value + "";
	}
	
	/*
		This produces an inclusive range, for the (range:) macro and anything else that needs a similar range.
		Only used by Macros and data structure macros.
	*/
	function range(a, b) {
		/*
			Descending ranges are supported.
		*/
		if (a > b) {
			return range(b, a);
		}
		/*
			This differs from Python: the base case returns just [a],
			instead of an empty array. The rationale is that since it is
			inclusive, a can serve as both start and end term just fine.
		*/
		const ret = [a];
		b -= a;
		while(b-- > 0) {
			ret.push(++a);
		}
		return ret;
	}

	/*
		This is used for JS/Harlowe intercommunication by <script> tags.
	*/
	function isHarloweJSValue(v) {
		return (typeof v === sString || typeof v === sBoolean
			|| (typeof v === sNumber && !Number.isNaN(v) && Math.abs(v) !== Infinity)
			|| (Array.isArray(v) && v.every(isHarloweJSValue))
			|| (v instanceof Set && [...v].every(isHarloweJSValue))
			|| (v instanceof Map && [...v.values()].every(isHarloweJSValue) &&
					/*
						Harlowe as of 3.3.0 only allows string keys for Maps, but a future
						version may relax this constraint.
					*/
					[...v.keys()].every(v => typeof v === sString)));
	}

	const OperationUtils = Object.freeze({
		isObject,
		isValidDatamapName,
		collectionType,
		isSequential,
		unstorableValue,
		isHarloweJSValue,
		clone,
		objectName,
		typeName,
		typeID,
		toSource,
		is,
		contains,
		isA,
		matches,
		subset,
		range,
		printBuiltinValue,
		/*
			An Array#filter() function which filters out duplicates using the is() comparator
			instead of Javascript referencing. This manually filters out similar array/map objects which
			Set()'s constructor won't filter out by itself.
		*/
		unique: (val1,ind,arr) => arr.findIndex(val2 => is(val1, val2)) === ind,
	});
	return OperationUtils;
});

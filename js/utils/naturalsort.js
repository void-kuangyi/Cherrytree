/*!
 * Natural Sort algorithm for Javascript - Version 0.7 - Released under MIT license
 * Author: Jim Palmer (based on chunking idea from Dave Koelle)
 * http://www.overset.com/2008/09/01/javascript-natural-sort-algorithm-with-unicode-support/
 * Expanded by Leon Arnott to use Intl.Collator, 2015.
 * Expanded by Leon Arnott to take a string-obtaining helper function, 2019.
 */
"use strict";
define('utils/naturalsort', [], function() {
	return function NaturalSort(locale, helper = String) {
		return function naturalSort(a, b) {
			let re = /(^-?[0-9]+(\.?[0-9]*)[df]?e?[0-9]?$|^0x[0-9a-f]+$|[0-9]+)/gi,
				dre = /(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[/-]\d{1,4}[/-]\d{1,4}|^\w+, \w+ \d+, \d{4})/,
				hre = /^0x[0-9a-f]+$/i,
				ore = /^0/,
				// convert all to strings strip whitespace
				x = helper(a).trim(),
				y = helper(b).trim(),
				// chunk/tokenize
				xN = x.replace(re, '\0$1\0').replace(/\0$/, '').replace(/^\0/, '').split('\0'),
				yN = y.replace(re, '\0$1\0').replace(/\0$/, '').replace(/^\0/, '').split('\0'),
				// numeric, hex or date detection
				xD = parseInt(x.match(hre)) || (xN.length !== 1 && x.match(dre) && Date.parse(x)),
				yD = parseInt(y.match(hre)) || xD && y.match(dre) && Date.parse(y) || null,
				oFxNcL, oFyNcL, collator, colCmp;
			// Use Intl.Collator if available
			if (locale && window.Intl && window.Intl.Collator)
				collator = window.Intl.Collator(locale);
			// first try and sort Hex codes or Dates
			if (yD)
				if (xD < yD) return -1;
				else if (xD > yD) return 1;
			// natural sorting through split numeric strings and default strings
			for (let cLoc = 0, numS = Math.max(xN.length, yN.length); cLoc < numS; cLoc++) {
				// find floats not starting with '0', string or 0 if not defined (Clint Priest)
				oFxNcL = !(xN[cLoc] || '').match(ore) && parseFloat(xN[cLoc]) || xN[cLoc] || 0;
				oFyNcL = !(yN[cLoc] || '').match(ore) && parseFloat(yN[cLoc]) || yN[cLoc] || 0;
				// handle numeric vs string comparison - number < string - (Kyle Adams)
				if (isNaN(oFxNcL) !== isNaN(oFyNcL)) {
					return (isNaN(oFxNcL)) ? 1 : -1;
				}
				// rely on string comparison if different types - i.e. '02' < 2 != '02' < '2'
				else if (typeof oFxNcL !== typeof oFyNcL) {
					oFxNcL += '';
					oFyNcL += '';
				}
				// use the collator if both sides are strings
				else if (typeof oFxNcL === 'string' && collator) {
					colCmp = collator.compare(oFxNcL, oFyNcL);
					if (colCmp !== 0) return colCmp;
				}
				if (oFxNcL < oFyNcL) return -1;
				if (oFxNcL > oFyNcL) return 1;
			}
			return 0;
		};
	};
});

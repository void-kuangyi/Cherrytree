describe("revision macros", function() {
	'use strict';
	['append','prepend'].forEach(function(name,index) {
		var append=!index;
		describe("("+name+":)", function() {
			it("accepts multiple hooksets and/or non-empty strings", function() {
				expect("(print:("+name+":?foo))").not.markupToError();
				expect("(print:("+name+":'baz'))").not.markupToError();
				expect("(print:("+name+":?foo, ?bar))").not.markupToError();
				expect("(print:("+name+":?foo, 'baz'))").not.markupToError();
				expect("(print:("+name+":'baz', 'baz'))").not.markupToError();
				expect("(print:("+name+":?foo, ?bar, ?baz))").not.markupToError();
				expect("(print:("+name+":'baz', 'baz', 'baz'))").not.markupToError();
				expect("(print:("+name+":''))").markupToError();
				expect("(print:("+name+":'', 'baz', 'baz'))").markupToError();
				expect("(print:("+name+":'foo', 'baz', ''))").markupToError();
			});
			describe("given a single hook", function() {
				it(name+"s the attached hook's contents with that of the target hook", function() {
					var p = runPassage("[cool]<foo|("+name+":?foo)[hot]");
					expect(p.find('tw-hook[name=foo]').length).toBe(1);
					expect(p.text()).toBe(append?'coolhot':'hotcool');
				});
				it("cannot affect hooks that have yet to be rendered", function() {
					var p = runPassage("("+name+":?foo)[hot][cool]<foo|");
					expect(p.find('tw-hook[name=foo]').length).toBe(1);
					expect(p.text()).toBe('cool');
				});
				it("can affect hooks that are after it in the passage", function() {
					var p = runPassage("(link:'baz')[("+name+":?foo)[hot]][cool]<foo|");
					p.find('tw-link').click();
					expect(p.text()).toBe(append ? 'coolhot' : 'hotcool');
				});
				it("sequential "+name+"s occur in order", function() {
					var p = runPassage("[1]<foo|("+name+":?foo)[2]("+name+":?foo)[3]");
					expect(p.text()).toBe(append?'123':'321');
				});
				it("nested "+name+"s are triggered one by one", function() {
					var p = runPassage("[1]<foo|("+name+":?foo)[2("+name+":?foo)[3]]("+name+":?foo)[4]");
					expect(p.text()).toBe(append?'1234':'4321');
				});
				it("can be composed with other ("+name+":)s", function() {
					var p = runPassage("(set:$s to ("+name+":?foo) + ("+name+":?bar))|foo>[1][2]<bar|$s[0]");
					expect(p.text()).toBe(append?'1020':'0102');
				});
				it("when stored, can work across passages", function() {
					runPassage("(set:$s to ("+name+":?bar))");
					var p = runPassage("[2]<bar|$s[0]");
					expect(p.text()).toBe(append?'20':'02');
				});
				it("works with temp variables", function() {
					var p = runPassage("(set:_a to 1)[(set:_a to 2)]<bar|("+name+":?bar)[(print:_a)]");
					expect(p.text()).toBe('2');
				});
				it("doesn't affect transitioning-out passages", function() {
					createPassage("("+name+":?foo)[grault]",'garply');
					var p = runPassage('[baz]<foo| (t8n-depart:"dissolve")[[garply]]');
					p.find('tw-link').click();
					expect($('tw-transition-container.transition-out [name="foo"]').text()).toBe('baz');
				});
			});
			describe("given multiple same-named hooks", function() {
				it(name+"s to each selected hook", function() {
					var p = runPassage("[bu]<foo|[los]<foo|("+name+":?foo)[s]");
					expect(p.find('tw-hook[name=foo]').length).toBe(2);
					expect(p.text()).toBe(append?'busloss':'sbuslos');
				});
				it("recomputes the source within each target", function() {
					var p = runPassage("(set:$a to 0)|foo>[A][B]<foo|[C]<foo|("+name+":?foo)[(set:$a to it + 1)$a]");
					expect(p.text()).toBe(append?'A1B2C3':'1A2B3C');
				});
			});
			describe("given multiple different-named hooks", function() {
				it(name+"s to each selected hook", function() {
					var p = runPassage("[bu]<foo|[los]<bar|("+name+":?bar,?foo)[s]");
					expect(p.find('tw-hook[name=foo], tw-hook[name=bar]').length).toBe(2);
					expect(p.text()).toBe(append?'busloss':'sbuslos');
				});
				it("recomputes the source within each target, in document position order", function() {
					var p = runPassage("(set:$a to 0)|foo>[A][B]<bar|[C]<baz|("+name+":?foo,?baz,?bar)[(set:$a to it + 1)$a]");
					expect(p.text()).toBe(append?'A1B2C3':'1A2B3C');
				});
				it("can be composed with other ("+name+":)s", function() {
					var p = runPassage("(set:$s to ("+name+":?foo, ?bar) + ("+name+":?bar, ?baz))|foo>[1][2]<bar|[3]<baz|$s[0]");
					expect(p.text()).toBe(append?'102030':'010203');
				});
			});
			describe("given a string", function() {
				it(name+"s to every found string in the passage", function() {
					var p = runPassage("good good("+name+":'good')[lands]");
					expect(p.text()).toBe(append?'goodlands goodlands':'landsgood landsgood');
				});
				it("does nothing when no occurrences exist", function() {
					var p = runPassage("good good("+name+":'bad')[lands]");
					expect(p.text()).toBe("good good");
				});
				it("only affects occurrences in a single pass", function() {
					var p = runPassage("reded("+name+":'red')[ r]");
					expect(p.text()).toBe(append?'red red':' rreded');
				});
				it("cannot affect occurrences that have yet to be rendered", function() {
					var p = runPassage("("+name+":'red')[blue]red");
					expect(p.text()).toBe('red');
				});
				it("can target verbatim text", function() {
					var p = runPassage("`[]`("+name+":'[]')[blue]");
					expect(p.text()).toBe(append?'[]blue':'blue[]');
				});
				it("can target text spanning hierarchies", function() {
					var p = runPassage("re//de//d("+name+":'red')[ r]");
					expect(p.text()).toBe(append?'red red':' rreded');
					p = runPassage("//re//ded("+name+":'red')[ r]");
					expect(p.text()).toBe(append?'red red':' rreded');
				});
				it("sequential "+name+"s occur one by one", function() {
					var p = runPassage("red("+name+":'red')[blue]("+name+": 'blue')[green]");
					expect(p.text()).toBe(append?'redbluegreen':'greenbluered');
				});
				it("recomputes the source within each target", function() {
					var p = runPassage("(set:$a to 0)AAA("+name+":'A')[(set:$a to it + 1)$a]");
					expect(p.text()).toBe(append?'A1A2A3':'1A2A3A');
				});
				it("can be composed with other ("+name+":)s", function() {
					runPassage("(set:$s to ("+name+":'1') + ("+name+":'2'))");
					var p = runPassage("12$s[0]");
					expect(p.text()).toBe(append?'1020':'0102');
				});
				it("when composed, only affects occurrences in a single pass", function() {
					var p = runPassage("reded("+name+":'blue')+("+name+":'red')[blue r]");
					expect(p.text()).toBe(append?'redblue red':'blue rreded');
					p = runPassage("reded("+name+":'red')+("+name+":'blue')[blue r]");
					expect(p.text()).toBe(append?'redblue red':'blue rreded');
				});
			});
			describe("given multiple strings", function() {
				it(name+"s to every found string in the passage", function() {
					var p = runPassage("good bad("+name+":'good','bad')[lands]");
					expect(p.text()).toBe(append?'goodlands badlands':'landsgood landsbad');
				});
				it("only affects occurrences in a single pass", function() {
					var p = runPassage("reded("+name+":'red','blue')[blue r]");
					expect(p.text()).toBe(append?'redblue red':'blue rreded');
				});
				it("recomputes the source within each target, in document position order", function() {
					var p = runPassage("(set:$a to 0)ABC("+name+":'A','C','B')[(set:$a to it + 1)$a]");
					expect(p.text()).toBe(append?'A1B2C3':'1A2B3C');
				});
				it("can be composed with other ("+name+":)s", function() {
					runPassage("(set:$s to ("+name+":'1','2') + ("+name+":'2','3'))");
					var p = runPassage("123$s[0]");
					expect(p.text()).toBe(append?'102030':'010203');
				});
			});
			describe("given the ?Page hook name", function() {
				it(name+"s to the <tw-story> element", function() {
					runPassage("("+name+":?Page)[//hands//]");
					var i = $('tw-story > i');
					expect(i.text()).toBe('hands');
				});
			});
			describe("given the ?Passage hook name", function() {
				it(name+"s to the current <tw-passage> element", function() {
					runPassage("("+name+":?Passage)[//hands//]''X''");
					var i = $('tw-passage').find('tw-sidebar').remove().end();
					expect(i.text()).toBe(append ? 'Xhands' : 'handsX');
				});
			});
			describe("given the ?Sidebar hook name", function() {
				it(name+"s to the current passage's <tw-sidebar> element", function() {
					runPassage("("+name+":?Sidebar)[//hands//]X");
					var i = $('tw-sidebar > i');
					expect(i.text()).toBe('hands');
				});
			});
			describe("given the ?Link hook name", function() {
				it(name+"s to every <tw-link> in the passage", function() {
					createPassage("''Red''", "grault");
					expect("[[ad->grault]](link-goto:'ad','grault')(link:'ad')[](click:?1)[]|1>[ad]"
						+"("+name+":?Link)[//he//]")
						.markupToPrint(append?'adheadheadheadhe' : 'headheadheadhead');
				});
			});
		});
	});
	describe("(replace:)", function() {
		it("accepts multiple hooksets and/or non-empty strings", function() {
			expect("(print:(replace:?foo))").not.markupToError();
			expect("(print:(replace:'baz'))").not.markupToError();
			expect("(print:(replace:?foo, ?bar))").not.markupToError();
			expect("(print:(replace:?foo, 'baz'))").not.markupToError();
			expect("(print:(replace:'baz', 'baz'))").not.markupToError();
			expect("(print:(replace:?foo, ?bar, ?baz))").not.markupToError();
			expect("(print:(replace:'baz', 'baz', 'baz'))").not.markupToError();
			expect("(print:(replace:''))").markupToError();
			expect("(print:(replace:'', 'baz', 'baz'))").markupToError();
			expect("(print:(replace:'foo', 'baz', ''))").markupToError();
		});
		describe("given a single hook", function() {
			it("replaces the attached hook's contents with that of the target hook", function() {
				var p = runPassage("[cool]<foo|(replace:?foo)[hot]");
				expect(p.find('tw-hook[name=foo]').length).toBe(1);
				expect(p.text()).toBe('hot');
			});
			it("cannot affect hooks that have yet to be rendered", function() {
				var p = runPassage("(replace:?foo)[hot][cool]<foo|");
				expect(p.find('tw-hook[name=foo]').length).toBe(1);
				expect(p.text()).toBe('cool');
			});
			it("can affect hooks that are after it in the passage", function() {
				var p = runPassage("(link:'baz')[(replace:?foo)[hot]][cool]<foo|");
				p.find('tw-link').click();
				expect(p.text()).toBe('hot');
			});
			it("sequential replacements occur in order", function() {
				var p = runPassage("[1]<foo|(replace:?foo)[2](replace:?foo)[3]");
				expect(p.text()).toBe('3');
			});
			it("nested replacements are triggered one by one", function() {
				var p = runPassage("[1]<foo|(replace:?foo)[2(replace:?foo)[3]](replace:?foo)[4]");
				expect(p.text()).toBe('4');
			});
			it("when stored, can work across passages", function() {
				runPassage("(set:$s to (replace:?bar))");
				var p = runPassage("[2]<bar|$s[0]");
				expect(p.text()).toBe('0');
			});
			it("works with temp variables", function() {
				var p = runPassage("(set:_a to 1)[(set:_a to 2)]<bar|(replace:?bar)[(print:_a)]");
				expect(p.text()).toBe('2');
			});
			it("doesn't affect transitioning-out passages", function() {
				createPassage("(replace:?foo)[grault]",'garply');
				var p = runPassage('[baz]<foo| (t8n-depart:"dissolve")[[garply]]');
				p.find('tw-link').click();
				expect($('tw-transition-container.transition-out [name="foo"]').text()).toBe('baz');
			});
		});
		describe("given multiple same-named hooks", function() {
			it("replaces each selected hook", function() {
				var p = runPassage("[a]<foo|[b]<foo|(replace:?foo)[c]");
				expect(p.find('tw-hook[name=foo]').length).toBe(2);
				expect(p.text()).toBe('cc');
			});
			it("recomputes the source within each target", function() {
				var p = runPassage("(set:$a to 0)|foo>[A][B]<foo|[C]<foo|(replace:?foo)[(set:$a to it + 1)$a]");
				expect(p.text()).toBe('123');
			});
		});
		describe("given multiple different-named hooks", function() {
			it("replaces each selected hook", function() {
				var p = runPassage("[a]<foo|[b]<bar|(replace:?foo,?bar)[c]");
				expect(p.find('tw-hook[name=foo],tw-hook[name=bar]').length).toBe(2);
				expect(p.text()).toBe('cc');
			});
			it("recomputes the source within each target, in document position order", function() {
				var p = runPassage("(set:$a to 0)|foo>[A][B]<bar|[C]<baz|(replace:?foo,?baz,?bar)[(set:$a to it + 1)$a]");
				expect(p.text()).toBe('123');
			});
		});
		describe("given a string", function() {
			it("replaces every found string in the passage", function() {
				var p = runPassage("goodlands goodminton(replace:'good')[bad]");
				expect(p.text()).toBe('badlands badminton');
			});
			it("does nothing when no occurrences exist", function() {
				var p = runPassage("good good(replace:'bad')[lands]");
				expect(p.text()).toBe("good good");
			});
			it("only affects occurrences in a single pass", function() {
				var p = runPassage("reded(replace:'red')[blue r]");
				expect(p.text()).toBe('blue red');
			});
			it("can replace verbatim text", function() {
				var p = runPassage("`[]`(replace:'[]')[blue]");
				expect(p.text()).toBe('blue');
			});
			it("can target text spanning hierarchies", function() {
				var p = runPassage("re//de//d(replace:'red')[blue]");
				expect(p.text()).toBe('blueed');
				p = runPassage("//re//ded(replace:'red')[blue]");
				expect(p.text()).toBe('blueed');
			});
			it("sequential replacements occur one by one", function() {
				var p = runPassage("red(replace:'red')[blue](replace: 'blue')[green]");
				expect(p.text()).toBe('green');
			});
			it("cannot affect occurrences that have yet to be rendered", function() {
				var p = runPassage("(replace:'red')[blue]red");
				expect(p.text()).toBe('red');
			});
		});
		describe("given multiple strings", function() {
			it("replaces every found string in the passage", function() {
				var p = runPassage("good bad(replace:'good','bad')[lands]");
				expect(p.text()).toBe('lands lands');
			});
			xit("only affects occurrences in a single pass", function() {
				var p = runPassage("reded(replace:'red','blue')[blue r]");
				expect(p.text()).toBe('blue red');
			});
			it("recomputes the source within each target, in document position order", function() {
				var p = runPassage("(set:$a to 0)ABC(replace:'A','C','B')[(set:$a to it + 1)$a]");
				expect(p.text()).toBe('123');
			});
			it("can be composed with other (replace:)s", function() {
				runPassage("(set:$a to 0)(set:$s to (replace:'A','B') + (replace:'2','B','C'))");
				var p = runPassage("ABC$s[(set:$a to it + 1)$a]");
				expect(p.text()).toBe('123');
			});
		});
		describe("given the ?Page hook name", function() {
			it("replaces the <tw-story> element", function() {
				runPassage("(replace:?Page)[//hands//]");
				var i = $('tw-story');
				expect(i.html()).toMatch(/<i>hands<\/i>/i);
			});
		});
		describe("given the ?Passage hook name", function() {
			it("replaces the current <tw-passage> element", function() {
				runPassage("(replace:?Passage)[//hands//]X");
				var i = $('tw-passage');
				expect(i.text()).toBe('hands');
			});
		});
		describe("given the ?Sidebar hook name", function() {
			it("replaces the current passage's <tw-sidebar> element", function() {
				runPassage("(replace:?Sidebar)[//hands//]X");
				var i = $('tw-sidebar');
				expect(i.text()).toBe('hands');
			});
		});
		describe("given the ?Link hook name", function() {
			it("replaces every <tw-link> in the passage", function() {
				createPassage("''Red''", "grault");
				expect("[[ad->grault]](link-goto:'ad','grault')(link:'ad')[](click:?1)[]|1>[ad]"
					+"(replace:?Link)[//he//]")
					.markupToPrint('hehehehe');
			});
		});
	});
	it("can be composed with each other", function() {
		runPassage("(set:$s to (append:'1') + (prepend:'2'))");
		var p = runPassage("12$s[0]");
		expect(p.text()).toBe('1002');
	});
	['append','prepend'].forEach(function(name,index) {
		describe("the (" + name + "-with:) macro", function() {
			it("produces a changer that " + name + "s its string or code hook to the source of the hook", function() {
				expect("(" + name + "-with:'hehe')[he]").markupToPrint('hehehe');
				expect("(" + name + "-with:[hehe])[he]").markupToPrint('hehehe');
				expect("(" + name + "-with:'foo')[bar]").markupToPrint(index ? 'foobar' : 'barfoo');
				expect("(print:(" + name + "-with:'hehe') is a changer)").markupToPrint('true');
			});
			it("won't cause structures to cross boundaries between the string or code hook, and the source", function() {
				expect(runPassage("(" + name + "-with:'a//b')[c//d]").find('i').length).toBe(0);
				expect(runPassage("(" + name + "-with:[a//b])[c//d]").find('i').length).toBe(0);
			});
			xit("works with (link:)", function() {
				var p = runPassage("(" + name + "-with:'foo')+(link:'baz')[bar]");
				expect(p.text()).toBe('baz');
				p.find('tw-link').click();
				expect(p.text()).toBe(index ? 'foobar' : 'barfoo');
			});
		});
		it("doesn't work with (enchant:)", function() {
			expect("(enchant:'hoho',(" + name + "-with:'haha'))hoho").markupToError();
		});
	});
	describe("the (replace-with:) macro", function() {
		it("produces a changer that replaces its string with the source of the hook", function() {
			expect("(replace-with:'hehe')[he]").markupToPrint('hehe');
			expect("(replace-with:[hehe])[he]").markupToPrint('hehe');
			expect("(replace-with:'foo')[bar]").markupToPrint('foo');
			expect("(print:(replace-with:'hehe') is a changer)").markupToPrint('true');
		});
		it("when combined, the final (replace-with:) takes precedence", function() {
			expect("(replace-with:'haha')+(replace-with:'hehe')[he]").markupToPrint('hehe');
		});
		it("doesn't work with (enchant:)", function() {
			expect("(enchant:'hoho',(replace-with:'haha'))hoho").markupToError();
		});
	});
});

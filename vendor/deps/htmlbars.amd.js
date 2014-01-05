define("htmlbars", 
  ["htmlbars/parser","htmlbars/ast","htmlbars/compiler","htmlbars/helpers","htmlbars/macros","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var preprocess = __dependency1__.preprocess;
    var HTMLElement = __dependency2__.HTMLElement;
    var BlockElement = __dependency2__.BlockElement;
    var compile = __dependency3__.compile;
    var registerHelper = __dependency4__.registerHelper;
    var removeHelper = __dependency4__.removeHelper;
    var registerMacro = __dependency5__.registerMacro;
    var removeMacro = __dependency5__.removeMacro;

    __exports__.preprocess = preprocess;
    __exports__.compile = compile;
    __exports__.HTMLElement = HTMLElement;
    __exports__.BlockElement = BlockElement;
    __exports__.removeHelper = removeHelper;
    __exports__.registerHelper = registerHelper;
    __exports__.removeMacro = removeMacro;
    __exports__.registerMacro = registerMacro;
  });
define("htmlbars/ast", 
  ["handlebars/compiler/ast","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MustacheNode = __dependency1__.MustacheNode;

    function HTMLElement(tag, attributes, children, helpers) {
      this.tag = tag;
      this.attributes = attributes || [];
      this.children = children || [];
      this.helpers = helpers || [];

      if (!attributes) { return; }

      for (var i=0, l=attributes.length; i<l; i++) {
        var attribute = attributes[i];
        attributes[attribute[0]] = attribute[1];
      }
    }

    function appendChild(node) {
      var len = this.children.length,
          lastNode = len > 0 ? this.children[len - 1] : null;

      // Back to back MustacheNodes need an empty text node delimiter
      if (lastNode && node instanceof MustacheNode && lastNode instanceof MustacheNode) {
        this.children.push('');
      }

      this.children.push(node);
    }

    HTMLElement.prototype = {
      appendChild: appendChild,

      removeAttr: function(name) {
        var attributes = this.attributes, attribute;
        delete attributes[name];
        for (var i=0, l=attributes.length; i<l; i++) {
          attribute = attributes[i];
          if (attribute[0] === name) {
            attributes.splice(i, 1);
            break;
          }
        }
      },

      getAttr: function(name) {
        var attributes = this.attributes;
        if (attributes.length !== 1 || attributes[0] instanceof MustacheNode) { return; }
        return attributes[name][0];
      }
    };

    function BlockElement(helper, children) {
      this.helper = helper;
      this.children = children || [];
    }

    BlockElement.prototype.appendChild = appendChild;

    __exports__.HTMLElement = HTMLElement;
    __exports__.BlockElement = BlockElement;
  });
define("htmlbars/compiler", 
  ["htmlbars/parser","htmlbars/compiler/compile","htmlbars/runtime","htmlbars/helpers","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var preprocess = __dependency1__.preprocess;
    var compileAST = __dependency2__.compileAST;
    var domHelpers = __dependency3__.domHelpers;
    var helpers = __dependency4__.helpers;

    function compile(string, options) {
      return compileSpec(string, options)(domHelpers(helpers));
    }

    __exports__.compile = compile;function compileSpec(string, options) {
      var ast = preprocess(string, options);
      return compileAST(ast, options);
    }

    __exports__.compileSpec = compileSpec;
  });
define("htmlbars/compiler/attr", 
  ["htmlbars/compiler/utils","htmlbars/compiler/helpers","htmlbars/compiler/invoke","htmlbars/compiler/stack","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var processOpcodes = __dependency1__.processOpcodes;
    var prepareHelper = __dependency2__.prepareHelper;
    var helper = __dependency3__.helper;
    var popStack = __dependency4__.popStack;
    var pushStack = __dependency4__.pushStack;
    var string = __dependency5__.string;
    var hash = __dependency5__.hash;
    var quotedArray = __dependency5__.quotedArray;

    function AttrCompiler() {}

    var attrCompiler = AttrCompiler.prototype;

    attrCompiler.compile = function(opcodes, options) {
      this.output = [];
      this.stackNumber = 0;
      this.stack = [];

      this.preamble();
      processOpcodes(this, opcodes);
      this.postamble();

      /*jshint evil:true*/
      return new Function('context', 'options', this.output.join("\n"));
    };

    attrCompiler.preamble = function() {
      this.push("var buffer = []");
    };

    attrCompiler.postamble = function() {
      this.push("return buffer.join('')");
    };

    attrCompiler.content = function(str) {
      this.push("buffer.push(" + string(str) +")");
    };

    attrCompiler.dynamic = function(parts, escaped) {
      this.push(helper('resolveInAttr', 'context', quotedArray(parts), 'buffer', 'options'));
    };

    attrCompiler.ambiguous = function(string, escaped) {
      this.push(helper('ambiguousAttr', 'context', quotedArray([string]), 'buffer', 'options'));
    };

    attrCompiler.helper = function(name, size, escaped) {
      var prepared = prepareHelper(this.stack, size);
      prepared.options.push('setAttribute:options.setAttribute');

      this.push(helper('helperAttr', 'context', string(name), prepared.args, 'buffer', hash(prepared.options)));
    };

    attrCompiler.appendText = function() {
      // noop
    };

    attrCompiler.program = function() {
      pushStack(this.stack, null);
      pushStack(this.stack, null);
    };

    attrCompiler.id = function(parts) {
      pushStack(this.stack, string('id'));
      pushStack(this.stack, string(parts[0]));
    };

    attrCompiler.literal = function(literal) {
      pushStack(this.stack, string(typeof literal));
      pushStack(this.stack, literal);
    };

    attrCompiler.string = function(str) {
      pushStack(this.stack, string('string'));
      pushStack(this.stack, string(str));
    };

    attrCompiler.stackLiteral = function(literal) {
      pushStack(this.stack, literal);
    };

    attrCompiler.push = function(string) {
      this.output.push(string + ";");
    };

    __exports__.AttrCompiler = AttrCompiler;
  });
define("htmlbars/compiler/compile", 
  ["htmlbars/compiler/pass1","htmlbars/compiler/pass2","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var Compiler1 = __dependency1__.Compiler1;
    var Compiler2 = __dependency2__.Compiler2;

    function compileAST(ast, options) {
      var compiler1 = new Compiler1(compileAST, options),
          compiler2 = new Compiler2(options);

      var opcodes = compiler1.compile(ast);
      return compiler2.compile(opcodes, {
        children: compiler1.children
      });
    }

    __exports__.compileAST = compileAST;
  });
define("htmlbars/compiler/elements", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function pushElement(compiler) {
      return "element" + (++compiler.elementNumber);
    }

    __exports__.pushElement = pushElement;function popElement(compiler) {
      return "element" + (compiler.elementNumber--);
    }

    __exports__.popElement = popElement;function topElement(compiler) {
      return "element" + compiler.elementNumber;
    }
    __exports__.topElement = topElement;
  });
define("htmlbars/compiler/fragment", 
  ["htmlbars/ast","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var HTMLElement = __dependency1__.HTMLElement;
    var BlockElement = __dependency1__.BlockElement;

    function Fragment() {}

    var prototype = Fragment.prototype;

    prototype.compile = function(ast) {
      this.opcodes = [];
      this.children = [];
      processChildren(this, ast);
      return {
        opcodes: this.opcodes,
        children: this.children
      };
    };

    function processChildren(compiler, children) {
      var node, lastNode;

      for (var i=0, l=children.length; i<l; i++) {
        node = children[i];

        if (typeof node === 'string') {
          compiler.string(node);
        } else if (node instanceof HTMLElement) {
          compiler.element(node);
        } else if (node instanceof BlockElement) {
          compiler.block(node);
        }

        lastNode = node;
      }
    }

    prototype.opcode = function(type) {
      var params = [].slice.call(arguments, 1);
      this.opcodes.push({ type: type, params: params });
    };

    prototype.string = function(string) {
      this.opcode('content', string);
    };

    prototype.element = function(element) {
      this.opcode('openElement', element.tag);

      element.attributes.forEach(function(attribute) {
        this.attribute(attribute);
      }, this);

      processChildren(this, element.children);

      this.opcode('closeElement');
    };

    prototype.attribute = function(attribute) {
      var name = attribute[0],
          value = attribute[1],
          hasMustache = false;

      if (value.length === 1 && typeof value[0] === 'string') {
        this.opcode('setAttribute', name, value[0]);
      }
    };

    prototype.ID = function(id) {
      this.opcode('id', id.parts);
    };

    prototype.STRING = function(string) {
      this.opcode('string', string.stringModeValue);
    };

    prototype.BOOLEAN = function(boolean) {
      this.opcode('literal', boolean.stringModeValue);
    };

    prototype.INTEGER = function(integer) {
      this.opcode('literal', integer.stringModeValue);
    };

    prototype.block = function(block) {
      var compiler = new Fragment(),
          program = compiler.compile(block.children, this.options),
          inverse = compiler.compile(block.inverse, this.options);

      this.children.push(program);
      this.children.push(inverse);
    };

    __exports__.Fragment = Fragment;
  });
define("htmlbars/compiler/fragment2", 
  ["htmlbars/compiler/utils","htmlbars/compiler/helpers","htmlbars/compiler/invoke","htmlbars/compiler/elements","htmlbars/compiler/stack","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __exports__) {
    "use strict";
    /*jshint evil:true*/

    var processOpcodes = __dependency1__.processOpcodes;
    var prepareHelper = __dependency2__.prepareHelper;
    var call = __dependency3__.call;
    var helper = __dependency3__.helper;
    var pushElement = __dependency4__.pushElement;
    var popElement = __dependency4__.popElement;
    var topElement = __dependency4__.topElement;
    var pushStack = __dependency5__.pushStack;
    var popStack = __dependency5__.popStack;
    var string = __dependency6__.string;
    var quotedArray = __dependency6__.quotedArray;
    var hash = __dependency6__.hash;

    function Fragment2() {}

    var compiler2 = Fragment2.prototype;

    compiler2.compile = function(opcodeTree) {
      this.output = [];
      this.elementNumber = 0;

      this.output.push("return function template() {");
      this.preamble();
      processOpcodes(this, opcodeTree.opcodes);
      this.postamble();
      this.output.push("};");

      var childCompiler = new Fragment2();
      return {
        fn: new Function('dom', this.output.join("\n")),
        children: opcodeTree.children.map(function (opcodes) {
          return childCompiler.compile(opcodes);
        })
      };
    };

    compiler2.preamble = function() {
      this.push("var element0, el");
      this.push("var frag = element0 = dom.createDocumentFragment()");
    };

    compiler2.postamble = function() {
      this.output.push("return frag;");
    };

    compiler2.program = function(programId, inverseId) {
      pushStack(this.stack, inverseId);
      pushStack(this.stack, programId);
    };

    compiler2.content = function(str) {
      this.push(helper('appendText', this.el(), string(str)));
    };

    compiler2.push = function(string) {
      this.output.push(string + ";");
    };

    compiler2.el = function() {
      return topElement(this);
    };

    compiler2.openElement = function(tagName) {
      var elRef = pushElement(this);
      this.push("var " + elRef + " = el = " + call('dom.createElement', string(tagName)));
    };

    compiler2.setAttribute = function(name, value) {
      this.push(call('dom.setAttribute', 'el', string(name), string(value)));
    };

    compiler2.closeElement = function() {
      var elRef = popElement(this);
      this.push(call([this.el(), 'appendChild'], elRef));
    };

    __exports__.Fragment2 = Fragment2;
  });
define("htmlbars/compiler/helpers", 
  ["htmlbars/compiler/quoting","htmlbars/compiler/stack","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var array = __dependency1__.array;
    var hash = __dependency1__.hash;
    var string = __dependency1__.string;
    var popStack = __dependency2__.popStack;

    function prepareHelper(stack, size) {
      var args = [],
          types = [],
          hashPairs = [],
          hashTypes = [],
          keyName,
          i;

      var hashSize = popStack(stack);

      for (i=0; i<hashSize; i++) {
        keyName = popStack(stack);
        hashPairs.unshift(keyName + ':' + popStack(stack));
        hashTypes.unshift(keyName + ':' + popStack(stack));
      }

      for (i=0; i<size; i++) {
        args.unshift(popStack(stack));
        types.unshift(popStack(stack));
      }

      var programId = popStack(stack);
      var inverseId = popStack(stack);

      var options = ['types:' + array(types), 'hashTypes:' + hash(hashTypes), 'hash:' + hash(hashPairs)];

      if (programId !== null) {
        options.push('render:childTemplates[' + programId + ']');
      }

      // TODO ensure inverseId always initialized
      // and remove undefined check
      if (inverseId !== null && inverseId !== undefined) {
        options.push('inverse:childTemplates[' + inverseId + ']');
      }

      return {
        options: options,
        args: array(args),
      };
    }

    __exports__.prepareHelper = prepareHelper;
  });
define("htmlbars/compiler/hydration", 
  ["htmlbars/utils","htmlbars/ast","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var merge = __dependency1__.merge;
    var HTMLElement = __dependency2__.HTMLElement;
    var BlockElement = __dependency2__.BlockElement;

    function HydrationCompiler(options) {
      this.options = options || {};

      var knownHelpers = {
        'helperMissing': true,
        'blockHelperMissing': true,
        'each': true,
        'if': true,
        'unless': true,
        'with': true,
        'log': true
      };

      this.options.knownHelpers = this.options.knownHelpers || {};
      merge(knownHelpers, this.options.knownHelpers);
    }

    var compiler1 = HydrationCompiler.prototype;

    compiler1.compile = function(ast) {
      this.opcodes = [];
      this.paths = [];
      this.children = [];
      processChildren(this, ast);
      return {
        opcodes: this.opcodes,
        children: this.children
      };
    };

    function processChildren(compiler, children) {
      var node, lastNode, currentDOMChildIndex = -1;

      for (var i=0, l=children.length; i<l; i++) {
        node = children[i];

        if (typeof node === 'string') {
          ++currentDOMChildIndex;
          // compiler.string(node);
        } else if (node instanceof HTMLElement) {
          compiler.paths.push(++currentDOMChildIndex);
          compiler.element(node, i, l, currentDOMChildIndex);
          compiler.paths.pop();
        } else if (node instanceof BlockElement) {
          compiler.block(node, i, l, currentDOMChildIndex);
        } else {
          compiler[node.type](node, i, l, currentDOMChildIndex);
        }

        lastNode = node;
      }
    }

    compiler1.block = function(block, childIndex, childrenLength, currentDOMChildIndex) {
      var compiler = new HydrationCompiler();

      var program = compiler.compile(block.children, this.options),
          inverse = compiler.compile(block.inverse, this.options),
          mustache = block.helper;


      var start = (currentDOMChildIndex < 0 ? null : currentDOMChildIndex),
          end = (childIndex === childrenLength - 1 ? null : currentDOMChildIndex + 1);

      this.children.push(program);
      var programId = this.children.length - 1;

      this.children.push(inverse);
      var inverseId = this.children.length - 1;

      this.opcode('program', programId, inverseId);
      processParams(this, mustache.params);
      processHash(this, mustache.hash);
      this.opcode('helper', mustache.id.string, mustache.params.length, mustache.escaped, this.paths.slice(), start, end);
    };

    compiler1.opcode = function(type) {
      var params = [].slice.call(arguments, 1);
      this.opcodes.push({ type: type, params: params });
    };

    compiler1.string = function(string) {
      this.opcode('content', string);
    };

    compiler1.element = function(element, childIndex, childrenLength, currentDOMChildIndex) {
      // this.opcode('openElement', element.tag);

      element.attributes.forEach(function(attribute) {
        this.attribute(attribute);
      }, this);

      element.helpers.forEach(function(helper) {
        this.nodeHelper(helper);
      }, this);

      processChildren(this, element.children);

      // this.opcode('closeElement');
    };

    compiler1.attribute = function(attribute) {
      var name = attribute[0],
          value = attribute[1],
          hasMustache = false;

      // TODO: improve this
      value.forEach(function(node) {
        if (typeof node !== 'string') {
          hasMustache = true;
        }
      });

      if (hasMustache) {
        value.forEach(function(node) {
          if (typeof node === 'string') {
            this.string(node);
          } else {
            this[node.type + 'InAttr'](node);
          }
        }, this);

        this.opcode('attribute', name, value.length, this.paths.slice());
      }
    };

    compiler1.nodeHelper = function(mustache) {
      this.opcode('program', null);
      processParams(this, mustache.params);
      processHash(this, mustache.hash);

      this.opcode('nodeHelper', mustache.id.string, mustache.params.length, this.paths.slice());
    };

    compiler1.mustache = function(mustache, childIndex, childrenLength, currentDOMChildIndex) {
      var type = classifyMustache(mustache, this.options);

      var start = (currentDOMChildIndex < 0 ? null : currentDOMChildIndex),
          end = (childIndex === childrenLength - 1 ? null : currentDOMChildIndex + 1);

      if (type === 'simple' || type === 'ambiguous') {
        this.opcode('ambiguous', mustache.id.string, mustache.escaped, this.paths.slice(), start, end);
      } else {
        this.opcode('program', null);
        processParams(this, mustache.params);
        processHash(this, mustache.hash);
        this.opcode('helper', mustache.id.string, mustache.params.length, mustache.escaped, this.paths.slice(), start, end);
      }

      // appendMustache(this, mustache);
    };

    compiler1.mustacheInAttr = function(mustache) {
      var type = classifyMustache(mustache, this.options);

      if (type === 'simple' || type === 'ambiguous') {
        this.opcode('ambiguousAttr', mustache.id.string, mustache.escaped);
      } else {
        this.opcode('program', null);
        processParams(this, mustache.params);
        processHash(this, mustache.hash);
        this.opcode('helperAttr', mustache.id.string, mustache.params.length, mustache.escaped);
      }

      // appendMustache(this, mustache);
    };

    compiler1.ID = function(id) {
      this.opcode('id', id.parts);
    };

    compiler1.STRING = function(string) {
      this.opcode('string', string.stringModeValue);
    };

    compiler1.BOOLEAN = function(boolean) {
      this.opcode('literal', boolean.stringModeValue);
    };

    compiler1.INTEGER = function(integer) {
      this.opcode('literal', integer.stringModeValue);
    };

    function classifyMustache(mustache, options) {
      var isHelper   = mustache.isHelper;
      var isEligible = mustache.eligibleHelper;

      // if ambiguous, we can possibly resolve the ambiguity now
      if (isEligible && !isHelper) {
        var name = mustache.id.parts[0];

        if (options.knownHelpers[name]) {
          isHelper = true;
        } else if (options.knownHelpersOnly) {
          isEligible = false;
        }
      }

      if (isHelper) { return "helper"; }
      else if (isEligible) { return "ambiguous"; }
      else { return "simple"; }
    }

    function processParams(compiler, params) {
      params.forEach(function(param) {
        compiler[param.type](param);
      });
    }

    function processHash(compiler, hash) {
      if (hash) {
        hash.pairs.forEach(function(pair) {
          var name = pair[0], param = pair[1];
          compiler[param.type](param);
          compiler.opcode('stackLiteral', name);
        });
        compiler.opcode('stackLiteral', hash.pairs.length);
      } else {
        compiler.opcode('stackLiteral', 0);
      }
    }

    function appendMustache(compiler, mustache) {
      if (mustache.escaped) {
        compiler.opcode('appendText');
      } else {
        compiler.opcode('appendHTML');
      }
    }

    __exports__.HydrationCompiler = HydrationCompiler;
  });
define("htmlbars/compiler/hydration2", 
  ["htmlbars/compiler/utils","htmlbars/compiler/helpers","htmlbars/compiler/invoke","htmlbars/compiler/stack","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    /*jshint evil:true*/

    var processOpcodes = __dependency1__.processOpcodes;
    var prepareHelper = __dependency2__.prepareHelper;
    var call = __dependency3__.call;
    var helper = __dependency3__.helper;
    var pushStack = __dependency4__.pushStack;
    var popStack = __dependency4__.popStack;
    var string = __dependency5__.string;
    var quotedArray = __dependency5__.quotedArray;
    var hash = __dependency5__.hash;
    var array = __dependency5__.array;

    function Hydration2() {}

    var prototype = Hydration2.prototype;

    prototype.compile = function(opcodeTree) {
      this.output = [];
      this.stack = [];

      this.output.push("return function hydrate(fragment, childTemplates) {");

      this.mustaches = [];

      processOpcodes(this, opcodeTree.opcodes);

      this.output.push("return [\n"+this.mustaches.join(",\n")+"\n];");
      this.output.push("};");

      var childCompiler = new Hydration2();

      return {
        fn: new Function("Range", this.output.join("\n")),
        children: opcodeTree.children.map(function (opcodes) {
          return childCompiler.compile(opcodes);
        })
      };
    };

    prototype.push = function(string) {
      this.output.push(string + ";");
    };

    prototype.program = function(programId, inverseId) {
      this.stack.push(inverseId);
      this.stack.push(programId);
    };

    prototype.id = function(parts) {
      pushStack(this.stack, string('id'));
      pushStack(this.stack, string(parts.join('.')));
    };

    prototype.literal = function(literal) {
      pushStack(this.stack, string(typeof literal));
      pushStack(this.stack, literal);
    };

    prototype.stackLiteral = function(literal) {
      pushStack(this.stack, literal);
    };

    prototype.string = function(str) {
      pushStack(this.stack, string('string'));
      pushStack(this.stack, string(str));
    };

    prototype.content = function(str) {
      pushStack(this.stack, string(str));
    };

    prototype.helper = function(name, size, escaped, parentPath, startIndex, endIndex) {
      var prepared = prepareHelper(this.stack, size);
      prepared.options.push('escaped:'+escaped);
      this.pushMustacheRange(string(name), prepared.args, prepared.options, parentPath, startIndex, endIndex);
    };

    prototype.ambiguous = function(str, escaped, parentPath, startIndex, endIndex) {
      this.pushMustacheRange(string(str), '[]', ['escaped:'+escaped], parentPath, startIndex, endIndex);
    };

    prototype.ambiguousAttr = function(str, escaped) {
      pushStack(this.stack, '['+string(str)+', [], {escaped:'+escaped+'}]');
    };

    prototype.helperAttr = function(name, size, escaped, elementPath) {
      var prepared = prepareHelper(this.stack, size);
      prepared.options.push('escaped:'+escaped);

      pushStack(this.stack, '['+string(name)+','+prepared.args+','+ hash(prepared.options)+']');
    };

    prototype.attribute = function(name, size, elementPath) {
      var args = [];
      for (var i = 0; i < size; i++) {
        args.unshift(popStack(this.stack));
      }

      var element = "fragment";
      for (i=0; i<elementPath.length; i++) {
        element += ".childNodes["+elementPath[i]+"]";
      }
      var pairs = ['element:'+element, 'name:'+string(name)];
      this.mustaches.push('["ATTRIBUTE", ['+ args +'],'+hash(pairs)+']');
    };

    prototype.nodeHelper = function(name, size, elementPath) {
      var prepared = prepareHelper(this.stack, size);
      this.pushMustacheInNode(string(name), prepared.args, prepared.options, elementPath);
    };

    prototype.pushMustacheRange = function(name, args, pairs, parentPath, startIndex, endIndex) {
      var parent = "fragment";
      for (var i=0; i<parentPath.length; i++) {
        parent += ".childNodes["+parentPath[i]+"]";
      }
      var range = "Range.create("+parent+","+
        (startIndex === null ? "null" : startIndex)+","+
        (endIndex === null ? "null" : endIndex)+")";

      pairs.push('range:'+range);

      this.mustaches.push('['+name+','+args+','+hash(pairs)+']');
    };

    prototype.pushMustacheInNode = function(name, args, pairs, elementPath) {
      var element = "fragment";
      for (var i=0; i<elementPath.length; i++) {
        element += ".childNodes["+elementPath[i]+"]";
      }
      pairs.push('element:'+element);
      this.mustaches.push('['+name+','+args+','+hash(pairs)+']');
    };

    __exports__.Hydration2 = Hydration2;
  });
define("htmlbars/compiler/hydration_attr", 
  ["htmlbars/compiler/utils","htmlbars/compiler/helpers","htmlbars/compiler/invoke","htmlbars/compiler/stack","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var processOpcodes = __dependency1__.processOpcodes;
    var prepareHelper = __dependency2__.prepareHelper;
    var helper = __dependency3__.helper;
    var popStack = __dependency4__.popStack;
    var pushStack = __dependency4__.pushStack;
    var string = __dependency5__.string;
    var hash = __dependency5__.hash;
    var quotedArray = __dependency5__.quotedArray;

    function HydrationAttrCompiler() {}

    var attrCompiler = HydrationAttrCompiler.prototype;

    attrCompiler.compile = function(opcodes, options) {
      this.output = [];
      this.stackNumber = 0;
      this.stack = [];

      // this.preamble();
      processOpcodes(this, opcodes);
      // this.postamble();

      /*jshint evil:true*/
      return opcodes;
    };

    attrCompiler.content = function(str) {
      pushStack(this.stack, string('string'));
      pushStack(this.stack, string(str));
    };

    attrCompiler.ambiguous = function(str, escaped) {
      pushStack(this.stack, string('string'));
      pushStack(this.stack, string(str));

      // this.push(helper('ambiguousAttr', 'context', quotedArray([string]), 'buffer', 'options'));
    };

    attrCompiler.helper = function(name, size, escaped) {
      var prepared = prepareHelper(this.stack, size);
      prepared.options.push('setAttribute:options.setAttribute');

      this.push(helper('helperAttr', 'context', string(name), prepared.args, 'buffer', hash(prepared.options)));
    };

    attrCompiler.appendText = function() {
      // noop
    };

    attrCompiler.program = function() {
      pushStack(this.stack, null);
      pushStack(this.stack, null);
    };

    attrCompiler.id = function(parts) {
      pushStack(this.stack, string('id'));
      pushStack(this.stack, string(parts[0]));
    };

    attrCompiler.literal = function(literal) {
      pushStack(this.stack, string(typeof literal));
      pushStack(this.stack, literal);
    };

    attrCompiler.string = function(str) {
      pushStack(this.stack, string('string'));
      pushStack(this.stack, string(str));
    };

    attrCompiler.stackLiteral = function(literal) {
      pushStack(this.stack, literal);
    };

    attrCompiler.push = function(string) {
      this.output.push(string + ";");
    };

    __exports__.HydrationAttrCompiler = HydrationAttrCompiler;
  });
define("htmlbars/compiler/invoke", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function call(func) {
      if (typeof func.join === 'function') {
        func = func.join('.');
      }

      var params = [].slice.call(arguments, 1);
      return func + "(" + params.join(", ") + ")";
    }

    __exports__.call = call;

    function helper() {
      var args = [].slice.call(arguments, 0);
      args[0] = 'dom.' + args[0];
      return call.apply(this, args);
    }
    __exports__.helper = helper;
  });
define("htmlbars/compiler/pass1", 
  ["htmlbars/utils","htmlbars/ast","htmlbars/compiler/attr","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var merge = __dependency1__.merge;
    var HTMLElement = __dependency2__.HTMLElement;
    var BlockElement = __dependency2__.BlockElement;
    var AttrCompiler = __dependency3__.AttrCompiler;

    function compileAttr(ast, options) {
      var compiler1 = new Compiler1(options),
          attrCompiler = new AttrCompiler(options);

      var opcodes = compiler1.compile(ast);
      return attrCompiler.compile(opcodes);
    }

    function Compiler1(compileAST, options) {
      this.compileAST = compileAST;
      this.options = options || {};

      var knownHelpers = {
        'helperMissing': true,
        'blockHelperMissing': true,
        'each': true,
        'if': true,
        'unless': true,
        'with': true,
        'log': true
      };

      this.options.knownHelpers = this.options.knownHelpers || {};
      merge(knownHelpers, this.options.knownHelpers);
    }

    var compiler1 = Compiler1.prototype;

    compiler1.compile = function(ast) {
      this.opcodes = [];
      this.opcodes2 = [];
      this.paths = [];
      this.children = [];
      processChildren(this, ast);
      return this.opcodes;
    };

    function processChildren(compiler, children) {
      var node, lastNode, currentDOMChildIndex = -1;

      for (var i=0, l=children.length; i<l; i++) {
        node = children[i];

        if (typeof node === 'string') {
          ++currentDOMChildIndex;
          compiler.string(node);
        } else if (node instanceof HTMLElement) {
          compiler.paths.push(++currentDOMChildIndex);
          compiler.element(node);
          compiler.paths.pop();
        } else if (node instanceof BlockElement) {
          compiler.block(node);
        } else {
          if (lastNode && lastNode.type === node.type) {
            ++currentDOMChildIndex;
            compiler.string();
          }
          compiler[node.type](node, i, l, currentDOMChildIndex);
        }

        lastNode = node;
      }
    }

    compiler1.block = function(block) {
      var program = this.compileAST(block.children, this.options),
          inverse = this.compileAST(block.inverse, this.options),
          mustache = block.helper;

      this.children.push(program);
      var programId = this.children.length - 1;

      this.children.push(inverse);
      var inverseId = this.children.length - 1;

      this.opcode('program', programId, inverseId);
      processParams(this, mustache.params);
      processHash(this, mustache.hash);
      this.opcode('helper', mustache.id.string, mustache.params.length, mustache.escaped);
      this.opcode('appendFragment');
    };

    compiler1.opcode = function(type) {
      var params = [].slice.call(arguments, 1);
      this.opcodes.push({ type: type, params: params });
    };

    compiler1.opcode2 = function() {
      var params = [].slice.call(arguments);
      this.opcodes2.push(params);
    };

    compiler1.string = function(string) {
      this.opcode('content', string);
    };

    compiler1.element = function(element) {
      this.opcode('openElement', element.tag);

      element.attributes.forEach(function(attribute) {
        this.attribute(attribute);
      }, this);

      element.helpers.forEach(function(helper) {
        this.nodeHelper(helper);
      }, this);

      processChildren(this, element.children);

      this.opcode('closeElement');
    };

    compiler1.attribute = function(attribute) {
      var name = attribute[0],
          value = attribute[1];

      var program = compileAttr(value);
      this.children.push(program);

      this.opcode('attribute', name, this.children.length - 1);
      return;
    };

    compiler1.nodeHelper = function(mustache) {
      this.opcode('program', null);
      processParams(this, mustache.params);
      processHash(this, mustache.hash);
      this.opcode('nodeHelper', mustache.id.string, mustache.params.length);
    };

    compiler1.mustache = function(mustache, childIndex, childrenLength, currentDOMChildIndex) {
      var type = classifyMustache(mustache, this.options);

      if (type === 'simple') {
        this.opcode('dynamic', mustache.id.parts, mustache.escaped);
      } else if (type === 'ambiguous') {
        this.opcode('ambiguous', mustache.id.string, mustache.escaped);
      } else {
        this.opcode('program', null);
        processParams(this, mustache.params);
        processHash(this, mustache.hash);
        this.opcode('helper', mustache.id.string, mustache.params.length, mustache.escaped);
      }

      var start = (currentDOMChildIndex < 0 ? null : currentDOMChildIndex),
          end = (childIndex === childrenLength - 1 ? null : currentDOMChildIndex + 1);
      this.opcode2(mustache.id.string, this.paths.slice(), start, end);

      appendMustache(this, mustache);
    };

    compiler1.ID = function(id) {
      this.opcode('id', id.parts);
    };

    compiler1.STRING = function(string) {
      this.opcode('string', string.stringModeValue);
    };

    compiler1.BOOLEAN = function(boolean) {
      this.opcode('literal', boolean.stringModeValue);
    };

    compiler1.INTEGER = function(integer) {
      this.opcode('literal', integer.stringModeValue);
    };

    function classifyMustache(mustache, options) {
      var isHelper   = mustache.isHelper;
      var isEligible = mustache.eligibleHelper;

      // if ambiguous, we can possibly resolve the ambiguity now
      if (isEligible && !isHelper) {
        var name = mustache.id.parts[0];

        if (options.knownHelpers[name]) {
          isHelper = true;
        } else if (options.knownHelpersOnly) {
          isEligible = false;
        }
      }

      if (isHelper) { return "helper"; }
      else if (isEligible) { return "ambiguous"; }
      else { return "simple"; }
    }

    function processParams(compiler, params) {
      params.forEach(function(param) {
        compiler[param.type](param);
      });
    }

    function processHash(compiler, hash) {
      if (hash) {
        hash.pairs.forEach(function(pair) {
          var name = pair[0], param = pair[1];
          compiler[param.type](param);
          compiler.opcode('stackLiteral', name);
        });
        compiler.opcode('stackLiteral', hash.pairs.length);
      } else {
        compiler.opcode('stackLiteral', 0);
      }
    }

    function appendMustache(compiler, mustache) {
      if (mustache.escaped) {
        compiler.opcode('appendText');
      } else {
        compiler.opcode('appendHTML');
      }
    }

    __exports__.Compiler1 = Compiler1;
  });
define("htmlbars/compiler/pass2", 
  ["htmlbars/compiler/utils","htmlbars/compiler/helpers","htmlbars/compiler/invoke","htmlbars/compiler/elements","htmlbars/compiler/stack","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __exports__) {
    "use strict";
    /*jshint evil:true*/

    var processOpcodes = __dependency1__.processOpcodes;
    var prepareHelper = __dependency2__.prepareHelper;
    var call = __dependency3__.call;
    var helper = __dependency3__.helper;
    var pushElement = __dependency4__.pushElement;
    var popElement = __dependency4__.popElement;
    var topElement = __dependency4__.topElement;
    var pushStack = __dependency5__.pushStack;
    var popStack = __dependency5__.popStack;
    var string = __dependency6__.string;
    var quotedArray = __dependency6__.quotedArray;
    var hash = __dependency6__.hash;

    function Compiler2() {}

    var compiler2 = Compiler2.prototype;

    compiler2.compile = function(opcodes, options) {
      this.output = [];
      this.elementNumber = 0;
      this.stackNumber = 0;
      this.stack = [];
      this.children = options.children;

      this.output.push("return function template(context, options) {");
      this.preamble();
      processOpcodes(this, opcodes);
      this.postamble();
      this.output.push("};");

      // console.debug(this.output.join("\n"));

      // have the generated function close over the DOM helpers
      return new Function('dom', this.output.join("\n"));
    };

    compiler2.preamble = function() {
      this.children.forEach(function(child, i) {
        this.push("var child" + i + " = " + child.toString());
      }, this);

      this.push("var element0, el");
      this.push("var frag = element0 = dom.createDocumentFragment()");
    };

    compiler2.postamble = function() {
      this.output.push("return frag;");
    };

    compiler2.program = function(programId, inverseId) {
      pushStack(this.stack, inverseId);
      pushStack(this.stack, programId);
    };

    compiler2.content = function(str) {
      this.push(helper('appendText', this.el(), string(str)));
    };

    compiler2.push = function(string) {
      this.output.push(string + ";");
    };

    compiler2.el = function() {
      return topElement(this);
    };

    compiler2.id = function(parts) {
      pushStack(this.stack, string('id'));
      pushStack(this.stack, quotedArray(parts));
    };

    compiler2.literal = function(literal) {
      pushStack(this.stack, string(typeof literal));
      pushStack(this.stack, literal);
    };

    compiler2.stackLiteral = function(literal) {
      pushStack(this.stack, literal);
    };

    compiler2.string = function(str) {
      pushStack(this.stack, string('string'));
      pushStack(this.stack, string(str));
    };

    compiler2.appendText = function() {
      this.push(helper('appendText', this.el(), popStack(this.stack)));
    };

    compiler2.appendHTML = function() {
      this.push(helper('appendHTML', this.el(), popStack(this.stack)));
    };

    compiler2.appendFragment = function() {
      this.push(helper('appendFragment', this.el(), popStack(this.stack)));
    };

    compiler2.openElement = function(tagName) {
      var elRef = pushElement(this);
      this.push("var " + elRef + " = el = " + call('dom.createElement', string(tagName)));
    };

    compiler2.attribute = function(name, child) {
      var invokeSetAttribute = call(['el', 'setAttribute'], string(name), 'value');
      var setAttribute = 'function setAttribute(value) { ' + invokeSetAttribute + '}';
      var options = hash(['setAttribute:' + setAttribute]);
      pushStack(this.stack, call('child' + child, 'context', options));

      this.push(call('dom.setAttribute', 'el', string(name), popStack(this.stack), hash(['context:context'])));
    };

    compiler2.closeElement = function() {
      var elRef = popElement(this);
      this.push(call([this.el(), 'appendChild'], elRef));
    };

    compiler2.dynamic = function(parts, escaped) {
      pushStack(this.stack, helper('resolveContents', 'context', quotedArray(parts), this.el(), escaped));
    };

    compiler2.ambiguous = function(str, escaped) {
      pushStack(this.stack, helper('ambiguousContents', this.el(), 'context', string(str), escaped));
    };

    compiler2.helper = function(name, size, escaped) {
      var prepared = prepareHelper(this.stack, size);
      pushStack(this.stack, helper('helperContents', string(name), this.el(), 'context', prepared.args, hash(prepared.options)));
    };

    compiler2.nodeHelper = function(name, size) {
      var prepared = prepareHelper(this.stack, size);
      this.push(helper('helperContents', string(name), this.el(), 'context', prepared.args, hash(prepared.options)));
    };

    __exports__.Compiler2 = Compiler2;
  });
define("htmlbars/compiler/quoting", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function escapeString(str) {
      return str.replace(/'/g, "\\'");
    }

    __exports__.escapeString = escapeString;

    function string(str) {
      return "'" + escapeString(str) + "'";
    }

    __exports__.string = string;

    function array(a) {
      return "[" + a + "]";
    }

    __exports__.array = array;

    function quotedArray(list) {
      return array(list.map(string).join(", "));
    }

    __exports__.quotedArray = quotedArray;function hash(pairs) {
      return "{" + pairs.join(",") + "}";
    }

    __exports__.hash = hash;
  });
define("htmlbars/compiler/stack", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // this file exists in anticipation of a more involved
    // stack implementation involving temporary variables

    function pushStack(stack, literal) {
      stack.push(literal);
    }

    __exports__.pushStack = pushStack;function popStack(stack) {
      return stack.pop();
    }

    __exports__.popStack = popStack;
  });
define("htmlbars/compiler/template", 
  ["htmlbars/compiler/fragment","htmlbars/compiler/hydration","htmlbars/compiler/hydration2","htmlbars/compiler/fragment2","htmlbars/parser","htmlbars/runtime","htmlbars/runtime/range","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __exports__) {
    "use strict";
    var Fragment = __dependency1__.Fragment;
    var HydrationCompiler = __dependency2__.HydrationCompiler;
    var Hydration2 = __dependency3__.Hydration2;
    var Fragment2 = __dependency4__.Fragment2;
    var preprocess = __dependency5__.preprocess;
    var domHelpers = __dependency6__.domHelpers;
    var Range = __dependency7__.Range;

    function compileAST(ast, options) {
      var fragmentCompiler = new Fragment(options),
          hydrationCompiler = new HydrationCompiler(compileAST, options),
          fragment2 = new Fragment2(),
          hydration2 = new Hydration2();

      var fragmentOpcodeTree = fragmentCompiler.compile(ast);
      var hydrationOpcodeTree = hydrationCompiler.compile(ast);

      var dom = domHelpers({});
      function closeOverDOM(tree) {
        var children = tree.children;
        tree.fn = tree.fn(dom);
        for (var i=0; i<children.length; i++) {
          closeOverDOM(children[i]);
        }
      }

      var fragmentFnTree = fragment2.compile(fragmentOpcodeTree);
      closeOverDOM(fragmentFnTree);

      function closeOverRange(tree) {
        var children = tree.children;
        tree.fn = tree.fn(Range);
        for (var i=0; i<children.length; i++) {
          closeOverRange(children[i]);
        }
      }
      var hydrationFnTree = hydration2.compile(hydrationOpcodeTree);
      closeOverRange(hydrationFnTree);

      function buildTemplate(fragmentFnTree, hydrationFnTree) {
        var childTemplates = [];
        for (var i=0, l=fragmentFnTree.children.length; i<l; i++) {
          childTemplates.push(buildTemplate(fragmentFnTree.children[i], hydrationFnTree.children[i]));
        }

        var cachedFragment;
        return function templateFunction(context, options) {
          if (!cachedFragment) {
            cachedFragment = fragmentFnTree.fn(context, options);
          }

          var clone = cachedFragment.cloneNode(true);
          var mustacheInfos = hydrationFnTree.fn(clone, childTemplates);
          var helpers = options && options.helpers || {};

          var mustacheInfo;
          for (var i = 0, l = mustacheInfos.length; i < l; i++) {
            mustacheInfo = mustacheInfos[i];
            var name = mustacheInfo[0],
                params = mustacheInfo[1],
                helperOptions = mustacheInfo[2];
            helperOptions.helpers = helpers;
            if (!helperOptions.element) { helperOptions.element = helperOptions.range; }

            if (name === 'ATTRIBUTE') {
              helpers.ATTRIBUTE(context, helperOptions.name, params, helperOptions);
            } else {
              helpers.RESOLVE(context, name, params, helperOptions);
            }
          }

          return clone;
        };
      }

      return buildTemplate(fragmentFnTree, hydrationFnTree);
    }

    function TemplateCompiler(options) {

    }

    TemplateCompiler.prototype = {
      compile: function(html, options) {
        var ast = preprocess(html, options);
        return compileAST(ast);
      }
    };

    __exports__.TemplateCompiler = TemplateCompiler;
  });
define("htmlbars/compiler/utils", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function processOpcodes(compiler, opcodes) {
      opcodes.forEach(function(opcode) {
        compiler[opcode.type].apply(compiler, opcode.params);
      });
    }

    __exports__.processOpcodes = processOpcodes;function stream(string) {
      return "dom.stream(function(stream) { return " + string + " })";
    }

    __exports__.stream = stream;
  });
define("htmlbars/helpers", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var helpers = {};

    function registerHelper(name, callback) {
      helpers[name] = callback;
    }

    __exports__.registerHelper = registerHelper;function removeHelper(name) {
      delete helpers[name];
    }

    __exports__.removeHelper = removeHelper;__exports__.helpers = helpers;
  });
define("htmlbars/html-parser/process-token", 
  ["htmlbars/ast","simple-html-tokenizer","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var HTMLElement = __dependency1__.HTMLElement;
    var BlockElement = __dependency1__.BlockElement;
    var Chars = __dependency2__.Chars;
    var StartTag = __dependency2__.StartTag;
    var EndTag = __dependency2__.EndTag;

    /**
      @param {String} state the current state of the tokenizer
      @param {Array} stack the element stack
      @token {Token} token the current token being built
      @child {Token|Mustache|Block} child the new token to insert into the AST
    */
    function processToken(state, stack, token, child, macros) {
      // EOF
      if (child === undefined) { return; }
      return handlers[child.type](child, currentElement(stack), stack, token, state, macros);
    }

    __exports__.processToken = processToken;function currentElement(stack) {
      return stack[stack.length - 1];
    }

    // This table maps from the state names in the tokenizer to a smaller
    // number of states that control how mustaches are handled
    var states = {
      "attributeValueDoubleQuoted": "attr",
      "attributeValueSingleQuoted": "attr",
      "attributeValueUnquoted": "attr",
      "beforeAttributeName": "in-tag"
    };

    var voidTagNames = "area base br col command embed hr img input keygen link meta param source track wbr";
    var voidMap = {};

    voidTagNames.split(" ").forEach(function(tagName) {
      voidMap[tagName] = true;
    });

    // Except for `mustache`, all tokens are only allowed outside of
    // a start or end tag.
    var handlers = {
      Chars: function(token, current) {
        current.appendChild(token.chars);
      },

      StartTag: function(tag, current, stack) {
        var element = new HTMLElement(tag.tagName, tag.attributes, [], tag.helpers);
        stack.push(element);

        if (voidMap.hasOwnProperty(tag.tagName)) {
          this.EndTag(tag, element, stack);
        }
      },

      block: function(block, current, stack) {
        stack.push(new BlockElement(block.mustache));
      },

      mustache: function(mustache, current, stack, token, state) {
        switch(states[state]) {
          case "attr":
            token.addToAttributeValue(mustache);
            return;
          case "in-tag":
            token.addTagHelper(mustache);
            return;
          default:
            current.appendChild(mustache);
        }
      },

      EndTag: function(tag, current, stack, token, state, macros) {
        if (current.tag !== tag.tagName) {
          throw new Error("Closing tag " + tag.tagName + " did not match last open tag " + current.tag);
        }

        var value = config.processHTMLMacros(current, macros);
        stack.pop();

        if (value === 'veto') { return; }

        var parent = currentElement(stack);
        parent.appendChild(value || current);
      }
    };

    var config = {
      processHTMLMacros: function() {}
    };

    __exports__.config = config;
  });
define("htmlbars/macros", 
  ["htmlbars/html-parser/process-token","htmlbars/ast","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var config = __dependency1__.config;
    var HTMLElement = __dependency2__.HTMLElement;

    var htmlMacros = {};

    function registerMacro(name, test, mutate) {
      htmlMacros[name] = { test: test, mutate: mutate };
    }

    __exports__.registerMacro = registerMacro;function removeMacro(name) {
      delete htmlMacros[name];
    }

    __exports__.removeMacro = removeMacro;function processHTMLMacros(element, macros) {
      var mutated, newElement;

      macros = macros || htmlMacros;

      for (var prop in htmlMacros) {
        var macro = htmlMacros[prop];
        if (macro.test(element)) {
          newElement = macro.mutate(element);
          if (newElement === undefined) { newElement = element; }
          mutated = true;
          break;
        }
      }

      if (!mutated) {
        return element;
      } else if (newElement instanceof HTMLElement) {
        return processHTMLMacros(newElement);
      } else {
        return newElement;
      }
    }

    // configure the HTML Parser
    config.processHTMLMacros = processHTMLMacros;
  });
define("htmlbars/parser", 
  ["simple-html-tokenizer","htmlbars/ast","htmlbars/html-parser/process-token","handlebars","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var Tokenizer = __dependency1__.Tokenizer;
    var Chars = __dependency1__.Chars;
    var StartTag = __dependency1__.StartTag;
    var EndTag = __dependency1__.EndTag;
    var HTMLElement = __dependency2__.HTMLElement;
    var BlockElement = __dependency2__.BlockElement;
    var processToken = __dependency3__.processToken;
    var Handlebars = __dependency4__["default"];

    function Visitor() {}

    Visitor.prototype = {
      constructor: Visitor,

      accept: function(node) {
        return this[node.type](node);
      }
    };

    function preprocess(html, options) {
      var ast = Handlebars.parse(html);
      return new HTMLProcessor(options || {}).accept(ast);
    }

    __exports__.preprocess = preprocess;function HTMLProcessor(options) {
      // document fragment
      this.elementStack = [new HTMLElement()];
      this.tokenizer = new Tokenizer('');
      this.macros = options.macros;
    }

    // TODO: ES3 polyfill
    var processor = HTMLProcessor.prototype = Object.create(Visitor.prototype);

    processor.program = function(program) {
      var statements = program.statements;

      for (var i=0, l=statements.length; i<l; i++) {
        this.accept(statements[i]);
      }

      process(this, this.tokenizer.tokenizeEOF());

      // return the children of the top-level document fragment
      return this.elementStack[0].children;
    };

    processor.block = function(block) {
      switchToHandlebars(this);

      process(this, block);

      if (block.program) {
        this.accept(block.program);
      }

      this.tokenizer.token = null;
      this.elementStack.push(new BlockElement());

      if (block.inverse) {
        this.accept(block.inverse);
      }

      var inverse = this.elementStack.pop();
      var blockNode = this.elementStack.pop();

      blockNode.inverse = inverse.children;

      var el = currentElement(this),
          len = el.children.length,
          lastNode;

      if (len > 0) {
        lastNode = el.children[len - 1];
      }

      // Back to back BlockElements need an empty text node delimiter
      if (lastNode && blockNode instanceof BlockElement && lastNode instanceof BlockElement) {
        el.children.push('');
      }

      el.children.push(blockNode);
    };

    processor.content = function(content) {
      var tokens = this.tokenizer.tokenizePart(content.string);

      return tokens.forEach(function(token) {
        process(this, token);
      }, this);
    };

    processor.mustache = function(mustache) {
      switchToHandlebars(this);

      process(this, mustache);
    };

    function switchToHandlebars(compiler) {
      var token = compiler.tokenizer.token;

      // TODO: Monkey patch Chars.addChar like attributes
      if (token instanceof Chars) {
        process(compiler, token);
        compiler.tokenizer.token = null;
      }
    }

    function process(compiler, token) {
      var tokenizer = compiler.tokenizer;
      processToken(tokenizer.state, compiler.elementStack, tokenizer.token, token, compiler.macros);
    }

    function currentElement(processor) {
      var elementStack = processor.elementStack;
      return elementStack[elementStack.length - 1];
    }

    StartTag.prototype.addToAttributeValue = function(char) {
      var value = this.currentAttribute[1] = this.currentAttribute[1] || [];

      if (value.length && typeof value[value.length - 1] === 'string' && typeof char === 'string') {
        value[value.length - 1] += char;
      } else {
        value.push(char);
      }
    };

    StartTag.prototype.addTagHelper = function(helper) {
      var helpers = this.helpers = this.helpers || [];

      helpers.push(helper);
    };
  });
define("htmlbars/runtime", 
  ["htmlbars/utils","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var merge = __dependency1__.merge;

    function domHelpers(helpers, extensions) {
      var base = {
        // These methods are runtime for now. If they are too expensive,
        // I may inline them at compile-time.
        appendText: function(element, value) {
          if (value === undefined) { return; }
          element.appendChild(document.createTextNode(value));
        },

        appendHTML: function(element, value) {
          if (value === undefined) { return; }
          element.appendChild(this.frag(element, value));
        },

        appendFragment: function(element, fragment) {
          if (fragment === undefined) { return; }
          element.appendChild(fragment);
        },

        ambiguousContents: function(element, context, string, escaped) {
          var helper, value, args;

          if (helper = helpers[string]) {
            return this.helperContents(string, element, context, [], { element: element, escaped: escaped });
          } else {
            return this.resolveContents(context, [string], element, escaped);
          }
        },

        helperContents: function(name, element, context, args, options) {
          var helper = helpers[name];
          options.element = element;
          args.push(options);
          return helper.apply(context, args);
        },

        resolveContents: function(context, parts, element, escaped) {
          var helper = helpers.RESOLVE;
          if (helper) {
            var options = {
              element: element,
              escaped: escaped,
              append: this.appendCallback(element),
              dom: this
            };

            return helper(context, parts, options);
          }

          return parts.reduce(function(current, part) {
            return current[part];
          }, context);
        },

        ambiguousAttr: function(context, string, stream, buffer, options) {
          var helper;

          if (helper = helpers[string]) {
            throw new Error("helperAttr is not implemented yet");
          } else {
            return this.resolveInAttr(context, [string], stream, buffer, options);
          }
        },

        helperAttr: function(context, name, args, buffer, options) {
          options.dom = this;
          var helper = helpers[name], position = buffer.length;
          args.push(options);

          var stream = this.throttle(helper.apply(context, args));

          buffer.push('');

          // skip(stream, 1)
          var skippedFirst = false;

          stream.subscribe(function(next) {
            buffer[position] = next;

            if (skippedFirst) {
              options.setAttribute(buffer.join(''));
            } else {
              skippedFirst = true;
            }
          });
        },

        resolveInAttr: function(context, parts, buffer, options) {
          var helper = helpers.RESOLVE_IN_ATTR;

          options.dom = this;

          if (helper) {
            var position = buffer.length;
            buffer.push('');

            var stream = helper.call(context, parts, options);

            // skip(stream, 1)
            var skippedFirst = false;

            stream.subscribe(function(next) {
              buffer[position] = next;

              if (skippedFirst) {
                options.setAttribute(buffer.join(''));
              } else {
                skippedFirst = true;
              }
            });

            return;
          }

          var out = parts.reduce(function(current, part) {
            return current[part];
          }, context);

          buffer.push(out);
        },

        setAttribute: function(element, name, value, options) {
          var callback;

          this.setAttr(element, name, subscribe);
          callback(value);

          function subscribe(listener) {
            callback = listener;
          }
        },

        setAttr: function(element, name, subscribe) {
          subscribe(function(value) {
            element.setAttribute(name, value);
          });
        },

        frag: function(element, string) {
          if (element.nodeType === 11) {
            element = this.createElement('div');
          }

          return this.createContextualFragment(element, string);
        },

        // overridable
        appendCallback: function(element) {
          return function(node) { element.appendChild(node); };
        },

        createElement: function() {
          return document.createElement.apply(document, arguments);
        },

        createDocumentFragment: function() {
          return document.createDocumentFragment.apply(document, arguments);
        },

        createContextualFragment: function(element, string) {
          var range = this.createRange();
          range.setStart(element, 0);
          range.collapse(false);
          return range.createContextualFragment(string);
        },

        createRange: function() {
          return document.createRange();
        },

        throttle: function(stream) {
          return stream;
        }
      };

      return extensions ? merge(extensions, base) : base;
    }

    __exports__.domHelpers = domHelpers;function hydrate(spec, options) {
      return spec(domHelpers(options.helpers || {}, options.extensions || {}));
    }

    __exports__.hydrate = hydrate;
  });
define("htmlbars/runtime/helpers", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function RESOLVE(context, path, params, options) {
      var helper = options.helpers[path];
      if (helper) {
        var ret = helper(context, params, options);
        if (ret) {
          options.range.appendText(ret);
        }
      } else {
        if (path === 'testing') { debugger; }
        var value = context[path];

        options.range.clear();
        if (options.escaped) {
          options.range.appendText(value);
        } else {
          options.range.appendHTML(value);
        }
      }
    }

    __exports__.RESOLVE = RESOLVE;function RESOLVE_IN_ATTR(context, path, params, options) {
      var helpers = options.helpers,
          helper = helpers[path];

      if (helper) {
        return helper(context, params, options);
      } else {
        return context[path];
      }
    }

    __exports__.RESOLVE_IN_ATTR = RESOLVE_IN_ATTR;function ATTRIBUTE(context, name, params, options) {

      var helpers = options.helpers,
          buffer = [];

      params.forEach(function(node) {
        if (typeof node === 'string') {
          buffer.push(node);
        } else {
          var helperOptions = node[2];
          helperOptions.helpers = helpers;
          var ret = helpers.RESOLVE_IN_ATTR(context, node[0], node[1], helperOptions);
          if (ret) { buffer.push(ret); }
        }
      });

      if (buffer.length) {
        options.element.setAttribute(name, buffer.join(''));
      }
    }
    __exports__.ATTRIBUTE = ATTRIBUTE;
  });
define("htmlbars/runtime/range", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function Range(parent, start, end) {
      this.parent = parent;
      this.start = start;
      this.end = end;
    }

    __exports__.Range = Range;Range.create = function (parent, startIndex, endIndex) {
      var start = startIndex === null ? null : parent.childNodes[startIndex],
          end = endIndex === null ? null : parent.childNodes[endIndex];
      return new Range(parent, start, end);
    };

    Range.prototype = {
      clear: function() {
        var parent = this.parent,
            start = this.start,
            end = this.end,
            current, previous;

        if (end === null) {
          current = parent.lastChild;
        } else {
          current = end.previousSibling;
        }

        while (current !== null && current !== start) {
          previous = current.previousSibling;
          parent.removeChild(current);
          current = previous;
        }
      },
      replace: function(node) {
        this.clear();
        this.appendChild(node);
      },
      appendChild: function(node) {
        this.parent.insertBefore(node, this.end);
      },
      appendChildren: function(nodeList) {
        var parent = this.parent,
            ref = this.end,
            i = nodeList.length,
            node;
        while (i--) {
          node = nodeList[i];
          parent.insertBefore(node, ref);
          ref = node;
        }
      },
      appendText: function (str) {
        this.appendChild(this.parent.ownerDocument.createTextNode(str));
      },
      appendHTML: function (html) {
        var parent = this.parent, element;
        if (parent.nodeType === 11) {
          /* TODO require templates always have a contextual element
             instead of element0 = frag */
          element = parent.ownerDocument.createElement('div');
        } else {
          element = parent.cloneNode(false);
        }
        element.innerHTML = html;
        this.appendChildren(element.childNodes);
      }
    };
  });
define("htmlbars/utils", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function merge(options, defaults) {
      for (var prop in defaults) {
        if (options.hasOwnProperty(prop)) { continue; }
        options[prop] = defaults[prop];
      }
      return options;
    }

    __exports__.merge = merge;
  });
define("simple-html-tokenizer", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /*jshint boss:true*/

    var objectCreate = Object.create || function(obj) {
      function F() {}
      F.prototype = obj;
      return new F();
    };

    function isSpace(char) {
      return (/[\n\r\t ]/).test(char);
    }

    function isAlpha(char) {
      return (/[A-Za-z]/).test(char);
    }

    function Tokenizer(input) {
      this.input = input;
      this.char = 0;
      this.state = 'data';
      this.token = null;
    }

    Tokenizer.prototype = {
      tokenize: function() {
        var tokens = [], token;

        while (true) {
          token = this.lex();
          if (token === 'EOF') { break; }
          if (token) { tokens.push(token); }
        }

        if (this.token) {
          tokens.push(this.token);
        }

        return tokens;
      },

      tokenizePart: function(string) {
        this.input += string;
        var tokens = [], token;

        while (this.char < this.input.length) {
          token = this.lex();
          if (token) { tokens.push(token); }
        }

        this.tokens = (this.tokens || []).concat(tokens);
        return tokens;
      },

      tokenizeEOF: function() {
        if (this.token) {
          return this.token;
        }
      },

      tag: function(Type, char) {
        char = char.toLowerCase();

        var lastToken = this.token;
        this.token = new Type(char);
        this.state = 'tagName';
        return lastToken;
      },

      selfClosing: function() {
        this.token.selfClosing = true;
      },

      attribute: function(char) {
        this.token.startAttribute(char);
        this.state = 'attributeName';
      },

      addToAttributeName: function(char) {
        this.token.addToAttributeName(char.toLowerCase());
      },

      addToAttributeValue: function(char) {
        this.token.addToAttributeValue(char);
      },

      commentStart: function() {
        var lastToken = this.token;
        this.token = new CommentToken();
        this.state = 'commentStart';
        return lastToken;
      },

      addToComment: function(char) {
        this.token.addChar(char);
      },

      emitData: function() {
        var lastToken = this.token;
        this.token = null;
        this.state = 'tagOpen';
        return lastToken;
      },

      emitToken: function() {
        var lastToken = this.token.finalize();
        this.token = null;
        this.state = 'data';
        return lastToken;
      },

      addData: function(char) {
        if (this.token === null) {
          this.token = new Chars();
        }

        this.token.addChar(char);
      },

      lex: function() {
        var char = this.input.charAt(this.char++);

        if (char) {
          // console.log(this.state, char);
          return this.states[this.state].call(this, char);
        } else {
          return 'EOF';
        }
      },

      states: {
        data: function(char) {
          if (char === "<") {
            return this.emitData();
          } else {
            this.addData(char);
          }
        },

        tagOpen: function(char) {
          if (char === "!") {
            this.state = 'markupDeclaration';
          } else if (char === "/") {
            this.state = 'endTagOpen';
          } else if (!isSpace(char)) {
            return this.tag(StartTag, char);
          }
        },

        markupDeclaration: function(char) {
          if (char === "-" && this.input[this.char] === "-") {
            this.char++;
            this.commentStart();
          }
        },

        commentStart: function(char) {
          if (char === "-") {
            this.state = 'commentStartDash';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.addToComment(char);
            this.state = 'comment';
          }
        },

        commentStartDash: function(char) {
          if (char === "-") {
            this.state = 'commentEnd';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.addToComment("-");
            this.state = 'comment';
          }
        },

        comment: function(char) {
          if (char === "-") {
            this.state = 'commentEndDash';
          } else {
            this.addToComment(char);
          }
        },

        commentEndDash: function(char) {
          if (char === "-") {
            this.state = 'commentEnd';
          } else {
            this.addToComment('-' + char);
            this.state = 'comment';
          }
        },

        commentEnd: function(char) {
          if (char === ">") {
            return this.emitToken();
          }
        },

        tagName: function(char) {
          if (isSpace(char)) {
            this.state = 'beforeAttributeName';
          } else if(/[A-Za-z]/.test(char)) {
            this.token.addToTagName(char);
          } else if (char === ">") {
            return this.emitToken();
          }
        },

        beforeAttributeName: function(char) {
          if (isSpace(char)) {
            return;
          } else if (char === "/") {
            this.state = 'selfClosingStartTag';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.attribute(char);
          }
        },

        attributeName: function(char) {
          if (isSpace(char)) {
            this.state = 'afterAttributeName';
          } else if (char === "/") {
            this.state = 'selfClosingStartTag';
          } else if (char === "=") {
            this.state = 'beforeAttributeValue';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.addToAttributeName(char);
          }
        },

        beforeAttributeValue: function(char) {
          if (isSpace(char)) {
            return;
          } else if (char === '"') {
            this.state = 'attributeValueDoubleQuoted';
          } else if (char === "'") {
            this.state = 'attributeValueSingleQuoted';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.state = 'attributeValueUnquoted';
            this.addToAttributeValue(char);
          }
        },

        attributeValueDoubleQuoted: function(char) {
          if (char === '"') {
            this.state = 'afterAttributeValueQuoted';
          } else {
            this.addToAttributeValue(char);
          }
        },

        attributeValueSingleQuoted: function(char) {
          if (char === "'") {
            this.state = 'afterAttributeValueQuoted';
          } else {
            this.addToAttributeValue(char);
          }
        },

        attributeValueUnquoted: function(char) {
          if (isSpace(char)) {
            this.state = 'beforeAttributeName';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.addToAttributeValue(char);
          }
        },

        afterAttributeValueQuoted: function(char) {
          if (isSpace(char)) {
            this.state = 'beforeAttributeName';
          } else if (char === "/") {
            this.state = 'selfClosingStartTag';
          } else if (char === ">") {
            return this.emitToken();
          } else {
            this.char--;
            this.state = 'beforeAttributeName';
          }
        },

        selfClosingStartTag: function(char) {
          if (char === ">") {
            this.selfClosing();
            return this.emitToken();
          } else {
            this.char--;
            this.state = 'beforeAttributeName';
          }
        },

        endTagOpen: function(char) {
          if (isAlpha(char)) {
            this.tag(EndTag, char);
          }
        }
      }
    };

    function Tag(tagName, attributes, options) {
      this.tagName = tagName || "";
      this.attributes = attributes || [];
      this.selfClosing = options ? options.selfClosing : false;
    }

    Tag.prototype = {
      constructor: Tag,

      addToTagName: function(char) {
        this.tagName += char;
      },

      startAttribute: function(char) {
        this.currentAttribute = [char.toLowerCase(), null];
        this.attributes.push(this.currentAttribute);
      },

      addToAttributeName: function(char) {
        this.currentAttribute[0] += char;
      },

      addToAttributeValue: function(char) {
        this.currentAttribute[1] = this.currentAttribute[1] || "";
        this.currentAttribute[1] += char;
      },

      finalize: function() {
        delete this.currentAttribute;
        return this;
      }
    };

    function StartTag() {
      Tag.apply(this, arguments);
    }

    StartTag.prototype = objectCreate(Tag.prototype);
    StartTag.prototype.type = 'StartTag';
    StartTag.prototype.constructor = StartTag;

    StartTag.prototype.toHTML = function() {
      return config.generateTag(this);
    };

    function generateTag(tag) {
      var out = "<";
      out += tag.tagName;

      if (tag.attributes.length) {
        out += " " + config.generateAttributes(tag.attributes);
      }

      out += ">";

      return out;
    }

    function generateAttributes(attributes) {
      var out = [], attribute, attrString, value;

      for (var i=0, l=attributes.length; i<l; i++) {
        attribute = attributes[i];

        out.push(config.generateAttribute.apply(this, attribute));
      }

      return out.join(" ");
    }

    function generateAttribute(name, value) {
      var attrString = name;

      if (value) {
        value = value.replace(/"/, '\\"');
        attrString += "=\"" + value + "\"";
      }

      return attrString;
    }

    function EndTag() {
      Tag.apply(this, arguments);
    }

    EndTag.prototype = objectCreate(Tag.prototype);
    EndTag.prototype.type = 'EndTag';
    EndTag.prototype.constructor = EndTag;

    EndTag.prototype.toHTML = function() {
      var out = "</";
      out += this.tagName;
      out += ">";

      return out;
    };

    function Chars(chars) {
      this.chars = chars || "";
    }

    Chars.prototype = {
      type: 'Chars',
      constructor: Chars,

      addChar: function(char) {
        this.chars += char;
      },

      toHTML: function() {
        return this.chars;
      }
    };

    function CommentToken() {
      this.chars = "";
    }

    CommentToken.prototype = {
      type: 'CommentToken',
      constructor: CommentToken,
      
      finalize: function() { return this; },

      addChar: function(char) {
        this.chars += char;
      },

      toHTML: function() {
        return "<!--" + this.chars + "-->";
      }
    };

    function tokenize(input) {
      var tokenizer = new Tokenizer(input);
      return tokenizer.tokenize();
    }

    function generate(tokens) {
      var output = "";

      for (var i=0, l=tokens.length; i<l; i++) {
        output += tokens[i].toHTML();
      }

      return output;
    }

    var config = {
      generateAttributes: generateAttributes,
      generateAttribute: generateAttribute,
      generateTag: generateTag
    };

    var original = {
      generateAttributes: generateAttributes,
      generateAttribute: generateAttribute,
      generateTag: generateTag
    };

    function configure(name, value) {
      config[name] = value;
    }

    __exports__.Tokenizer = Tokenizer;
    __exports__.tokenize = tokenize;
    __exports__.generate = generate;
    __exports__.configure = configure;
    __exports__.original = original;
    __exports__.StartTag = StartTag;
    __exports__.EndTag = EndTag;
    __exports__.Chars = Chars;
    __exports__.CommentToken = CommentToken;
  });
//
//# sourceMappingURL=htmlbars-0.1.0.amd.js.map
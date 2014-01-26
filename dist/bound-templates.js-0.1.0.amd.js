define("bound-templates", 
  ["htmlbars/compiler","bound-templates/stream","bound-templates/runtime","htmlbars/utils","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var htmlbarsCompile = __dependency1__.compile;
    var Stream = __dependency2__.Stream;
    var RESOLVE = __dependency3__.RESOLVE;
    var RESOLVE_IN_ATTR = __dependency3__.RESOLVE_IN_ATTR;
    var ATTRIBUTE = __dependency3__.ATTRIBUTE;
    var merge = __dependency4__.merge;

    function compile(string, options) {
      return htmlbarsCompile(string, options);
    }

    __exports__.compile = compile;__exports__.Stream = Stream;
  });

define("bound-templates/compiler", 
  ["htmlbars/runtime","htmlbars/utils","bound-templates/stream","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var hydrateTemplate = __dependency1__.hydrate;
    var merge = __dependency2__.merge;
    var whenChanged = __dependency3__.whenChanged;

    function resolveHTML(model, parts, options) {
      var stream = new options.dom.PathObserver(model, parts.join(".")),
          range = new Placeholder(options.element, options.dom);

      range.bind('innerHTML', stream);
      options.dom.appendRange(options.element, range);
    }

    var defaultHelpers = {
      RESOLVE: function(parts, options) {
        if (!options.escaped) {
          return resolveHTML(this, parts, options);
        }

        var stream = new options.dom.PathObserver(this, parts.join(".")),
            textNode = new options.dom.TextNode("");

        textNode.bind('textContent', stream);
        options.append(textNode);
      },

      RESOLVE_IN_ATTR: function(parts, options) {
        return new options.dom.PathObserver(this, parts.join("."));
      }
    };

    function hydrate(spec, options) {
      options = options || {};

      var helpers = options.helpers = options.helpers || {};
      var extensions = options.extension = options.extensions || {};

      merge(helpers, defaultHelpers);
      merge(extensions, defaultExtensions);

      return hydrateTemplate(spec, options);
    }

    __exports__.hydrate = hydrate;
  });

define("bound-templates/lazy-value", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var NIL = function NIL(){}, // TODO: microoptimize... object literal or fn? :P
        EMPTY_ARRAY = [];

    function LazyValue(fn) {
      this.valueFn = fn;
    }

    // TODO: Function.prototype.makeLazy helper?

    LazyValue.prototype = {
      isLazyValue: true,
      parent: null, // TODO: is parent even needed? could be modeled as a subscriber
      children: null,
      cache: NIL,
      valueFn: null,
      subscribers: null, // TODO: do we need multiple subscribers?
      _childValues: null, // just for reusing the array, might not work well if children.length changes after computation

      value: function() {
        var cache = this.cache;
        if (cache !== NIL) { return cache; }

        var children = this.children;
        if (children) {
          var child,
              values = this._childValues || new Array(children.length);

          for (var i = 0, l = children.length; i < l; i++) {
            child = children[i];
            values[i] = (child && child.isLazyValue) ? child.value() : child;
          }

          return this.cache = this.valueFn(values);
        } else {
          return this.cache = this.valueFn(EMPTY_ARRAY);
        }
      },

      addDependentValue: function(value) {
        var children = this.children;
        if (!children) {
          children = this.children = [value];
        } else {
          children.push(value);
        }

        if (value && value.isLazyValue) { value.parent = this; }

        return this;
      },

      notify: function(sender) {
        var cache = this.cache,
            parent,
            subscribers;

        if (cache !== NIL) {
          parent = this.parent;
          subscribers = this.subscribers;
          cache = this.cache = NIL;

          if (parent) { parent.notify(this); }
          if (!subscribers) { return; }
          for (var i = 0, l = subscribers.length; i < l; i++) {
            subscribers[i](this); // TODO: should we worry about exception handling?
          }
        }
      },

      onNotify: function(callback) {
        var subscribers = this.subscribers;
        if (!subscribers) {
          subscribers = this.subscribers = [callback];
        } else {
          subscribers.push(callback);
        }
        return this;
      },

      destroy: function() {
        this.parent = this.children = this.cache = this.valueFn = this.subscribers = this._childValues = null;
      }
    };

    __exports__["default"] = LazyValue;
  });

define("bound-templates/runtime", 
  ["bound-templates/stream","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var Stream = __dependency1__["default"];

    function streamifyArgs(context, params, options) {
      var helpers = options.helpers;

      // Convert ID params to streams
      for (var i = 0, l = params.length; i < l; i++) {
        if (options.types[i] === 'id') {
          params[i] = helpers.STREAM_FOR(context, params[i]);
        }
      }

      // Convert hash ID values to streams
      var hash = options.hash,
          hashTypes = options.hashTypes;
      for (var key in hash) {
        if (hashTypes[key] === 'id') {
          hash[key] = helpers.STREAM_FOR(context, hash[key]);
        }
      }
    }

    function updatePlaceholder(placeholder, escaped, value) {
      if (escaped) {
        placeholder.appendText(value);
      } else {
        placeholder.appendHTML(value);
      }
    }

    function RESOLVE(context, path, params, options) {
      var helpers = options.helpers,
          helper = helpers[path];
      if (helper) {
        streamifyArgs(context, params, options);

        var fragmentLazyValue = helper(params, options);
        if (fragmentLazyValue) {
          fragmentLazyValue.onNotify(function(sender) {
            options.placeholder.replace(sender.value());
          });

          options.placeholder.replace(fragmentLazyValue.value());
        }
      } else {
        var lazyValue = helpers.STREAM_FOR(context, path);

        lazyValue.onNotify(function(sender) {
          options.placeholder.clear();
          updatePlaceholder(options.placeholder, options.escaped, sender.value());
        });

        updatePlaceholder(options.placeholder, options.escaped, lazyValue.value());
      }
    }

    __exports__.RESOLVE = RESOLVE;// FIXME: We can implement this as a `concat` sexpr with LazyValues
    function AttributeBuilder() {
      var self = this;

      this.parts = [];
      this.values = [];
      this.next = null;

      this.stream = new Stream(function(next) {
        self.next = next;
      });
    }

    AttributeBuilder.prototype = {
      stream: null,

      string: function() {
        return this.values.join('');
      },

      pushStatic: function(value) {
        this.parts.push(value);
        this.values.push(value);
      },

      pushStream: function(stream) {
        var builder = this,
            streamIndex = this.parts.length;

        this.parts.push(stream);
        this.values.push('');

        stream.onNotify(function(sender) {
          builder.updateValueAt(streamIndex, sender.value());
        });

        builder.updateValueAt(streamIndex, stream.value());
      },

      updateValueAt: function(streamIndex, value) {
        this.values[streamIndex] = value;
        this.next(this.string());
      },

      subscribe: function(next) {
        var unsubscribe = this.stream.subscribe.apply(this.stream, arguments);
        next(this.string());
        return unsubscribe;
      }
    };

    function ATTRIBUTE(context, name, params, options) {
      var helpers = options.helpers,
          builder = new AttributeBuilder(name); // TODO: make this hookable

      params.forEach(function(node) {
        if (typeof node === 'string') {
          builder.pushStatic(node);
        } else {
          var helperOptions = node[2];
          helperOptions.helpers = helpers;

          // TODO: support attributes returning more than streams
          var stream = helpers.RESOLVE_IN_ATTR(context, node[0], node[1], helperOptions);
          builder.pushStream(stream);
        }
      });

      builder.subscribe(function(value) {
        options.element.setAttribute(name, value);
      });
    }

    __exports__.ATTRIBUTE = ATTRIBUTE;function RESOLVE_IN_ATTR(context, path, params, options) {
      var helpers = options.helpers,
          helper = helpers[path];

      if (helper) {
        streamifyArgs(context, params, options);
        return helper(params, options);
      } else {
        return helpers.STREAM_FOR(context, path);
      }
    }

    __exports__.RESOLVE_IN_ATTR = RESOLVE_IN_ATTR;
  });

define("bound-templates/stream", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
      @function Stream
      @param {Function[Next, Error, Complete]->void} callback

      Creates a new stream. Calls the callback with functions that will
      invoke the `next`, `error` and `complete` callbacks on subscribers.

      Example:

      ```js
      var interval = new Stream(function(next, error, complete) {
        setInterval(function() {
          next("tick");
        }, 1000);
      });

      interval.subscribe(function(val) {
        // this will get triggered every second with the value "tick"
      });
      ```

      The `subscribe` method on the newly created stream returns a function
      that can be used to unsubscribe.
    */
    function Stream(callback) {
      var subscribers = [];

      function next(value) {
        subscribers.forEach(function(sub) { if (sub.next) sub.next(value); });
      }

      function complete() {
        subscribers.forEach(function(sub) { if (sub.complete) sub.complete(); });
      }

      function error(reason) {
        subscribers.forEach(function(sub) { if (sub.error) sub.error(reason); });
      }

      this.subscribe = function(next, error, complete) {
        var subscriber = { next: next, error: error, complete: complete };
        subscribers.push(subscriber);

        return function() {
          remove(subscribers, subscriber);
        };
      };

      callback.call(this, next, error, complete);
    }

    __exports__["default"] = Stream;

    function lazy(subscribeCallback) {
      return new Stream(function(next, error, complete) {
        var subscribe = this.subscribe;

        this.subscribe = function() {
          var unsubscribe = subscribe.apply(this, arguments);
          subscribeCallback(next, error, complete);
          return unsubscribe;
        };
      });
    }

    __exports__.lazy = lazy;function lifecycle(callbacks) {
      return new Stream(function(next, error, complete) {
        var subscribe = this.subscribe;

        var subscribers = 0;

        this.subscribe = function() {
          var unsubscribe = subscribe.apply(this, arguments);
          if (subscribers++ === 0) {
            callbacks.activate.call(this);
          }

          return function() {
            unsubscribe();
            if (--subscribers === 0) {
              callbacks.deactivate.call(this);
            }
          };
        };
      });
    }

    __exports__.lifecycle = lifecycle;function map(parent, callback, binding) {
      return lazy(function(next, error, complete) {
        parent.subscribe(function(value) {
          next(callback.call(binding, value));
        }, error, complete);
      });
    }

    __exports__.map = map;function currentValue(parent) {
      return lazy(function(next, error, complete) {
        var current;

        parent.subscribe(function(value) {
          current = value;
          next(value);
        }, error, complete);
      });
    }

    __exports__.currentValue = currentValue;function whenChanged(parent) {
      return lazy(function(next, error, complete) {
        var current;

        parent.subscribe(function(value) {
          if (current === value) return;

          current = value;
          next(value);
        }, error, complete);
      });
    }

    __exports__.whenChanged = whenChanged;function zipLatest(first, second, callback) {
      var subscriptions = [];
      var values = [], completed = [];

      var zipped = lazy(function(next, error, complete, subscription) {
        subscriptions.push(subscription);

        subscribe(first, 0);
        subscribe(second, 1);

        function subscribe(stream, position) {
          completed[position] = false;

          return stream.subscribe(function(value) {
            values[position] = value;
            next(values);
          }, error, function() {
            completed[position] = true;
            possiblyComplete();
          });
        }

        function possiblyComplete() {
          if (completed.every(function(value) { return value; })) complete();
        }
      });

      if (callback) {
        return map(zipped, function(values) {
          return callback.apply(this, values);
        });
      } else {
        return zipped;
      }
    }

    __exports__.zipLatest = zipLatest;function remove(array, object) {
      var index = array.indexOf(object);
      if (index === -1) return;
      array.splice(index, 1);
    }
  });
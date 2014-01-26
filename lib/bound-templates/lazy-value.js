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

export default LazyValue;
(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // G.Emitter — minimal synchronous event emitter.
  // Listeners are NOT part of serialized state; a cloned game starts with none.
  // ---------------------------------------------------------------
  function Emitter() {
    this._listeners = Object.create(null);
    this._any = [];
  }

  Emitter.prototype.on = function (type, fn) {
    if (type === '*') { this._any.push(fn); return this; }
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
    return this;
  };

  Emitter.prototype.once = function (type, fn) {
    const self = this;
    function wrap() { self.off(type, wrap); return fn.apply(null, arguments); }
    return this.on(type, wrap);
  };

  Emitter.prototype.off = function (type, fn) {
    if (type === '*') {
      if (!fn) this._any = [];
      else G.util.removeFrom(this._any, fn);
      return this;
    }
    const arr = this._listeners[type];
    if (!arr) return this;
    if (!fn) delete this._listeners[type];
    else G.util.removeFrom(arr, fn);
    return this;
  };

  Emitter.prototype.emit = function (type, payload) {
    const arr = this._listeners[type];
    if (arr) {
      const copy = arr.slice();
      for (let i = 0; i < copy.length; i++) copy[i](payload, type);
    }
    if (this._any.length) {
      const copy = this._any.slice();
      for (let i = 0; i < copy.length; i++) copy[i](payload, type);
    }
    return this;
  };

  Emitter.prototype.removeAll = function () {
    this._listeners = Object.create(null);
    this._any = [];
  };

  G.Emitter = Emitter;
})(globalThis.G = globalThis.G || {});

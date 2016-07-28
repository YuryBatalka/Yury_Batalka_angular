'use strict';


function Scope() {
    this.$$watchers = []; 
    this.$$asyncQueue = []; 
    this.$$postDigestQueue = []; 
    this.$$phase = null; 
}


Scope.prototype.$beginPhase = function (phase) {
    if (this.$$phase) { 
        throw this.$$phase + ' is in progress';
    }
    this.$$phase = phase;
};


Scope.prototype.$clearPhase = function () {
    this.$$phase = null;
};



Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    if (watchFn) { 
        var self = this;
        var watcher = {
            watchFn: watchFn, 
            listenerFn: listenerFn || function () {}, 
            valueEq: !!valueEq, 
            last: initWatchVal 
        };
        self.$$watchers.push(watcher); 
        return function () { 
            var index = self.$$watchers.indexOf(watcher);
            if (index >= 0) {
                self.$$watchers.splice(index, 1);
            }
        };
    }
    throw " 'WatchFn' is mandatory";
};



Scope.prototype.$watchGroup = function (watchFns, listenerFn) {

    if (watchFns.length) { 
        var self = this;
        var newValues = new Array(watchFns.length);
        var oldValues = new Array(watchFns.length);

        var destroyFunctions = _.map(watchFns, function (watchFn, i) { 
            return self.$watch(watchFn, function (newValue, oldValue) {
                newValues[i] = newValue;
                oldValues[i] = oldValue;
                listenerFn(newValues, oldValues, self);
            });
        });
        return function () { 
            _.forEach(destroyFunctions, function (destroyFunction) {
                destroyFunction();
            });
        };

    }

};


Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
    if (valueEq) { 
        return _.isEqual(newValue, oldValue);
    } else { 
        return newValue === oldValue ||
            (typeof newValue === 'number' && typeof oldValue === 'number' &&
                isNaN(newValue) && isNaN(oldValue));
    }
};

Scope.prototype.$$digestOnce = function () {
    var self = this;
    var dirty;
    _.forEach(this.$$watchers, function (watch) {
        try {
            var newValue = watch.watchFn(self);
            var oldValue = watch.last;
            if (!self.$$areEqual(newValue, oldValue, watch.valueEq)) {
                watch.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
                dirty = true;
            }
            watch.last = (watch.valueEq ? _.cloneDeep(newValue) : newValue);
        } catch (e) {
            (console.error || console.log)(e);
        }
    });
    return dirty;
};


Scope.prototype.$digest = function () {
    var ttl = 10; 
    var dirty; 
    this.$beginPhase("$digest"); 
    do { 
        while (this.$$asyncQueue.length) { 
            try {
                var asyncTask = this.$$asyncQueue.shift(); 
                this.$eval(asyncTask.expression); 
            } catch (e) {
                (console.error || console.log)(e);
            }
        }
        dirty = this.$$digestOnce(); 
        if (dirty && !(ttl--)) { 
            this.$clearPhase(); 
            throw "10 digest iterations reached";
        }
    } while (dirty);
    this.$clearPhase(); 

    while (this.$$postDigestQueue.length) { 
        try {
            this.$$postDigestQueue.shift()(); 
        } catch (e) {
            (console.error || console.log)(e);
        }
    }
};


Scope.prototype.$eval = function (expr, locals) {
    return expr(this, locals);
};


Scope.prototype.$apply = function (expr) {
    try {
        this.$beginPhase("$apply"); 
        if (_.isFunction(expr)) { 
            return this.$eval(expr)
        }
    } finally {
        this.$clearPhase(); 
        this.$digest(); 
};


Scope.prototype.$evalAsync = function (expr) {
    var self = this;
    if (!self.$$phase && !self.$$asyncQueue.length) { 
        setTimeout(function () {
            if (self.$$asyncQueue.length) {
                self.$digest();
            }
        }, 0);
    }
    self.$$asyncQueue.push({
        scope: self,
        expression: expr
    }); 
};


Scope.prototype.$$postDigest = function (fn) { 
    this.$$postDigestQueue.push(fn);
};


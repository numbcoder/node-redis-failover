var zk = require('node-zookeeper-client');
var CreateMode = zk.CreateMode;
var Event = zk.Event;
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require('log4js').getLogger('lock');

var LOCK_PREFIX = 'lock-';

function Lock(client, node, callback) {
  EventEmitter.call(this);
  this.client = client;
  this.node = node;
  this.path = null;
  this.isMaster = false;
  this.leader = null;
  this._init(callback);
}

util.inherits(Lock, EventEmitter);

Lock.prototype._init = function(callback) {
  var self = this;
  this.client.create(this.node + '/' + LOCK_PREFIX, CreateMode.EPHEMERAL_SEQUENTIAL, function(err, path) {
    if (err) {
      callback(err);
      return;
    }
    self.path = path.replace(self.node + '/', '');
    self.check(callback);
  });
};


/**
 *
 * @param [callback] {Function}
 */
Lock.prototype.check = function(callback) {
  var self = this;
  callback || (callback = function(){});

  this.getLocks(function(err, children) {
    if (err) {
      logger.error('get lock error: %j', err);
      callback(err);
      return;
    }
    logger.warn('children, %j, self path: %s', children, self.path);
    if (self.path == children[0]) {
      self.isMaster = true;
      self.leader = null;
      logger.info('this lock: %s is Master', self.path);
      callback(null, self);
      self.emit('promote', self);
    } else {
      var index = children.indexOf(self.path);
      self.leader = children[index - 1];
      self.watchLeader();
      callback(null, self);
    }
  });
};

Lock.prototype.getLocks = function(callback) {
  this.client.getChildren(this.node, function(err, children) {
    if (err) {
      callback(err);
      return;
    }

    children.sort(function(a, b) {
      return parseInt(a.substr(LOCK_PREFIX.length), 10) - parseInt(b.substr(LOCK_PREFIX.length), 10);
    });

    callback(null, children);
  });
};

Lock.prototype.watchLeader = function() {
  if (this.isMaster) return;
  var self = this;
  this.client.exists(this.node + '/' + this.leader, this._watcher.bind(this), function(err, stat) {
    if (err || !stat) {
      logger.warn('leader not exist! ,leader: %s', self.leader);
    }
  });
};

Lock.prototype._watcher = function(event) {
  if (event.type === Event.NODE_DELETED) {
    logger.info('leader node was deleted!, leader: %s', event.toString());
    this.check();
  }
};

module.exports = Lock;

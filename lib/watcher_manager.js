var EventEmitter = require('events').EventEmitter;
var util = require('util');
var os = require('os');
var async = require('async');
var RedisNode = require('./redis_node');
var zookeeper = require('./zookeeper');
var strategy = require('./strategy');
var logger = require('log4js').getLogger('WatcherManager');

var DEFAULT_PATH = '/redis_failover';
//var LOCKS_PATH = DEFAULT_PATH + '/locks';
//var REDIS_PATH = DEFAULT_PATH + '/redis';
//var WATCHERS_PATH = DEFAULT_PATH + '/node_watchers';
var CHECK_TIME = 3000;
var READY_TIME = 3000;


function WatcherManager(opts) {
  EventEmitter.call(this);
  this.nodes = {};
  this.masterNode = null;
  this.redisState = null;

  this.rootPath = DEFAULT_PATH + '/' + opts.name;
  this.locksPath = this.rootPath + '/locks';
  this.watchersPath = this.rootPath + '/watchers';
  this.path = this.watchersPath + '/' + os.hostname() + '-' + process.pid;

  this.opts = opts;
  this.isMaster = false;
  this.isolatedNodes = [];
  this.interval = null;
  this.readyForUpdate = false;
  this.failures = 0;

  this._init();
}

util.inherits(WatcherManager, EventEmitter);

WatcherManager.prototype._init = function() {
  var self = this;
  var opts = self.opts;
  this.zk = zookeeper.createClient(opts.zooKeeper, function() {
    var paths = [self.locksPath, self.watchersPath];
    self.zk.createPathBatch(paths, function(err) {
      if (err) {
        logger.error('Node Manager init fail, err: ', err);
        throw err;
      }
      self.zk.createEphemeral(self.path, function(err) {
        if (err) {
          logger.error(err);
          throw err;
        }
        self._ready();
      });
    });
  });
};

WatcherManager.prototype._ready = function() {
  var self = this;
  this.getLock(function() {
    self.initNodes();

    if (self.isMaster) {
      self.startCollect();
    }
  });
};

WatcherManager.prototype.startCollect = function () {
  var self = this;
  if (self.interval) {
    clearInterval(self.interval);
  }

  if (self.isMaster) {
    self.interval = setInterval(function() {
      self.collectData();
    }, CHECK_TIME);
  }
};

// collect data from others nodes
WatcherManager.prototype.collectData = function() {
  if (!this.readyForUpdate) return;

  var self = this;
  self.zk.getChildrenData(self.watchersPath, function(err, data) {
    if (err) {
      logger.error('get children data err: %s', err.message);
      self.failures += 1;
      if (self.failures >= 3) {
        throw err;
      }
      return;
    }
    var result = strategy.elect(data);
    //logger.debug('~~ collect data result, %j', data);
    // master unavailable
    if (!self.masterNode || result.unavailable.indexOf(self.masterNode.name) > -1) {
      logger.warn('master node unavailable, will promote a new one in %j !', result.available);
      //master is unavailable
      self.masterNode = null;
      self.promoteRedisMaster(result.available, 0, function() {
        self.updateRedisState(result);
      });
      return;
    }

    self.updateRedisState(result);
  });
};


WatcherManager.prototype.onPromote = function() {
  logger.info('Promote to master monitor node!')
  this.resetNode();
  this.startCollect();
};

// redis node available
var onAvailable = function(node) {
  var self = this;
  var name = node.name;

  logger.info('redis node available, %j', node);
  // if this manager is master
  if (self.isMaster) {
    if (self.masterNode) {
      if (name !== self.masterNode.name && node.master != self.masterNode.name) {
        node.slaveOf(self.masterNode, function(err) {
          if (err) {
            logger.error('%s slave of %s fail, reason: %s', node.name, self.masterNode.name, err.message);
          } else {
            logger.info('%s slave of %s success!', node.name, self.masterNode.name);
          }
        });
      }
    } else if (node.isMaster) {
      self.masterNode = node;
      async.eachSeries(self.isolatedNodes, function(n, cb) {
        var _node = self.nodes[n];
        if (!_node || _node.master == self.masterNode.name) return cb();

        _node.slaveOf(self.masterNode, function(err) {
          if (err) {
            logger.error('%s slave of %s fail, reason: %s', _node.name, self.masterNode.name, err.message);
          } else {
            logger.info('%s slave of %s success!', _node.name, self.masterNode.name);
          }
          cb();
        });
      }, function() {
        self.isolatedNodes = [];
      });
    } else {
      self.isolatedNodes.push(name);
    }
  }

  self.updateData();
};

// redis node unavailable
var onUnavailable = function(node) {
  logger.warn('redis node %s is unavailable!', node.name);
  var self = this;
  var name = node.name;
  this.removeNode(name);
  this.addNode(node.options);

  self.updateData();

  if (self.isMaster) {
    self.collectData();
  }
};

WatcherManager.prototype.addNode = function(opts) {
  var node = new RedisNode(opts);
  node.on('available', onAvailable.bind(this));
  node.on('unavailable', onUnavailable.bind(this));
  this.nodes[node.name] = node;
  logger.info('add node, %j', node);
};


WatcherManager.prototype.removeNode = function(name) {
  logger.info('remove node name: %s', name);
  var node = this.nodes[name];
  node.close();
  node = null;
  delete this.nodes[name];
};

WatcherManager.prototype.initNodes = function() {
  var self = this;
  var redisServers = self.opts.servers.split(',');
  redisServers.forEach(function(server) {
    var h = server.split(':');
    self.addNode({
      host: h[0], 
      port: h[1], 
      password: self.opts.password,
      pingInterval: self.opts.pingInterval,
      pingTimeout: self.opts.pingTimeout,
      maxFailures: self.opts.maxFailures
    });
  });

  setTimeout(function() {
    logger.info('ready for update data to zookeeper!');
    self.readyForUpdate = true;
    self.updateData();
  }, READY_TIME);
};

WatcherManager.prototype.close = function() {
  for (var name in this.nodes) {
    this.removeNode(name);
  }
  this.zk.close();
  this.zk = null;
};

WatcherManager.prototype.resetNode = function(opts) {
  logger.info('Reset all nodes ~~');
  this.readyForUpdate = false;
  if (opts) {
    this.opts = opts;
  }

  for (var name in this.nodes) {
    this.removeNode(name);
  }

  this.initNodes();
};


WatcherManager.prototype.promoteRedisMaster = function(nodes, index, callback) {
  var self = this;
  if (this.masterNode && this.masterNode.available) {
    return callback();
  }

  index || (index = 0);

  if (index >= nodes.length) {
    logger.error('no redis node can be promote to be Master!');
    return callback();
  }

  logger.info('promote new redis master, candidate nodes: %j', nodes);
  var node = this.nodes[nodes[index]];

  if (!node || !node.available) {
    self.promoteRedisMaster(nodes, index + 1, callback);
    return;
  }

  node.makeMaster(function(err) {
    if (err) {
      logger.error('make %s to master fail, err: %s', node.name, err.message);
      self.promoteRedisMaster(nodes, index + 1, callback);
      return;
    }

    self.masterNode = node;
    logger.info('make %s to master success!', node.name);

    nodes.splice(index, 1);
    async.each(nodes, function(name, cb) {
      var _node = self.nodes[name];
      if (!_node) return cb();

      _node.slaveOf(self.masterNode, function(err) {
        if (err) {
          logger.error('%s slave to master: %s fail, err: %s', name, self.masterNode.name, err.message);
          onUnavailable(_node);
        } else {
          logger.info('%s slave to master: %s success!', name, self.masterNode.name);
        }
        cb();
      });
    }, function() {
      logger.info('promote a new master: %s success!', self.masterNode.name);
      callback();
    });
  });
};

// update redis state to zookeeper
WatcherManager.prototype.updateData = function() {
  if (!this.readyForUpdate) return;

  var available = [], unavailable = [];
  for (var name in this.nodes) {
    var node = this.nodes[name];
    if (node.available) {
      available.push(name);
    } else {
      unavailable.push(name);
    }
  }

  this.zk.setData(this.path, {available: available, unavailable: unavailable}, function(err) {
    if (err) {
      logger.error('watcher manager set data fail! err: %s', err.message);
      throw err;
    }
  });
};

WatcherManager.prototype.updateNodesInfo = function(callback) {
  var self = this;
  var names = Object.keys(self.nodes);
  async.each(names, function(name, next) {
    var node = self.nodes[name];
    if (node.available) {
      node.updateInfo(next);
    } else {
      next();
    }
  }, callback);
};

// master update the electe result to zookeeper
WatcherManager.prototype.updateRedisState = function(data) {
  if (!this.isMaster) return;

  if (data.available.length === 0) {
    var redisState = {master: null, slaves: [], unavailable: data.unavailable};
    this.setState(redisState);
    return;
  }

  var self = this;
  self.updateNodesInfo(function() {
    var slaves = [];
    data.available.forEach(function(name) {
      if (name == self.masterNode.name) return;

      var node = self.nodes[name];
      if (node.available && node.master === self.masterNode.name && node.linkedMaster) {
        slaves.push(name);
      } else {
        data.unavailable.push(name);

        if (node.master && !node.linkedMaster) {
          logger.warn('%s linked to master: %s fail!', name, node.master);
        }
      }
    });

    var redisState = {master: self.masterNode.name, slaves: slaves, unavailable: data.unavailable};
    
    self.setState(redisState);
  });
};

WatcherManager.prototype.setState = function(state) {
  var self = this;
  if (!this.checkState(state)) {
    this.redisState = state;
    if (this.masterNode && this.masterNode.password) {
      this.redisState['password'] = this.masterNode.password;
    }
    this.zk.setData(self.rootPath, self.redisState, function(err) {
      if (err) {
        logger.error('update redis state err, %s', err.message);
        throw err;
      } else {
        logger.info('@Update redis state success!, state: %j', self.redisState);
      }
    });
  }
};

//check the resut to loacl redisState
WatcherManager.prototype.checkState = function(state) {
  var localState = this.redisState;
  if (!localState || localState.master != state.master) return false;

  if (localState.slaves.length !== state.slaves.length) return false;

  for (var i = 0, l = state.length; i < l; i++) {
    var name = state[i];
    if (localState.indexOf(name) < 0) {
      return false;
    }
  }

  return true;
};

WatcherManager.prototype.getLock = function(callback) {
  var self = this;
  self.zk.createLock(self.locksPath, function(err, lock) {
    if (err) {
      logger.error('create lock error!, %s', err.message);
      callback(err);
      throw err;
    }
    self.lock = lock;
    self.isMaster = lock.isMaster;
    self.lock.on('promote', function() {
      if (!self.isMaster) {
        self.isMaster = true;
        self.onPromote();
      }
    });
    logger.info('create lock success, this is %s monitor!', self.isMaster ? 'master' : 'spare');
    callback();
  });
};


module.exports = WatcherManager;

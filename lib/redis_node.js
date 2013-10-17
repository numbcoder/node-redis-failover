var redis = require('redis');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require('log4js').getLogger('RedisNode');

var MAX_OP_TIME = 5 * 1000;
//var WAIT_TIME = 2; //sec
var WATCH_INTERVAL = 3 * 1000;

function RedisNode(opts) {
  EventEmitter.call(this);
  this.options = opts;
  this.host = opts.host;
  this.port = opts.port;
  this.failures = 0;
  this.maxFailures = opts.maxFailures || 3;
  this.name = this.host + ':' + this.port;
  //this.waitKey = '_redis_failover_' + Date.now().toString(36) + parseInt(Math.random() * 100, 10).toString(36);
  this.interval = null;
  this.isMaster = false;
  this.available = false;

  var self = this;
  var options = {retry_max_delay: 10000};
  if (opts.password) {
    options.auth_pass = opts.password;
  }
  this.client = redis.createClient(this.port, this.host, options);
  this.client.on('ready', function() {
    self.updateInfo(function() {
      self.watch();
    });
  });

  var isConnectFail = false;
  this.client.on('error', function(err) {
    isConnectFail = true;
    logger.error('connect to redis %s error: %s', self.name, err.message);
  });
  this.client.on('end', function() {
    if (isConnectFail) return;

    self.available = false;
    logger.warn('%s redis client is end, will emit unavailable', self.name);
    self.emit('unavailable', self);
    self.stopWatch();
    isConnectFail = false;
  });
}

util.inherits(RedisNode, EventEmitter);

RedisNode.prototype.close = function() {
  this.available = false;
  this.removeAllListeners();
  this.stopWatch();
  clearTimeout(this.client.retry_timer);
  this.client.end();
};

RedisNode.prototype.fail = function() {
  this.failures += 1;
  if (this.failures >= this.maxFailures) {
    logger.error('%s fail %s times, will be emit unavailable!', this.name, this.failures);
    this.available = false;
    this.stopWatch();
    this.emit('unavailable', this);
    this.failures = 0;
  }
};

/*
RedisNode.prototype.wait = function() {
  var self = this;
  var timeout = setTimeout(function() {
    logger.warn('%s redis wait timeout', self.name);
    self.fail();
  }, MAX_OP_TIME);
  this.client.blpop(this.waitKey, WAIT_TIME, function(err) {
    clearTimeout(timeout);
    if (err) {
      logger.warn('%s redis wait error: %j, failures %s', self.name, err, self.failures);
      self.fail();
    }
  });
};
*/

RedisNode.prototype.ping = function() {
  var self = this;
  var timeout = setTimeout(function() {
    logger.warn('%s redis ping timeout', self.name);
    self.fail();
  }, MAX_OP_TIME);
  this.client.ping(function(err) {
    clearTimeout(timeout);
    if (err) {
      self.fail();
      logger.warn('%s redis ping error: %s, failures %s', self.name, err.message, self.failures);
    }
  });
};

/*
RedisNode.prototype.wakeup = function() {
  if (this.isMaster) {
    this.client.lpush(this.waitKey, '1');
  }
};
*/

RedisNode.prototype.watch = function() {
  var self = this;
  if (this.interval) {
    this.stopWatch();
  }
  this.interval = setInterval(function() {
    self.ping();
  }, WATCH_INTERVAL);
};

RedisNode.prototype.stopWatch = function() {
  clearInterval(this.interval);
};

RedisNode.prototype.slaveOf = function(master, callback) {
  var self = this;
  this.updateInfo(function() {
    var masterName = master.host + ':' + master.port;
    if (self.name === masterName || self.master === masterName) return callback();

    self.client.slaveof(master.host, master.port, function(err) {
      self.updateInfo(function() {
        callback(err);
      });
    });
  });
};

RedisNode.prototype.makeMaster = function(callback) {
  this.slaveOf({host: 'NO', port: 'ONE'}, callback);
};

RedisNode.prototype.getInfo = function(callback) {
  var self = this;
  this.client.info(function(err, info) {
    if (err) {
      logger.error('get %s info error: %s', self.name, err.message);
      return callback();
    }

    var obj = {};
    var lines = info.toString().split("\r\n");
    lines.forEach(function (line) {
      var parts = line.split(':');
      if (parts[1]) {
        obj[parts[0]] = parts[1];
      }
    });

    callback(obj);
  });
};

RedisNode.prototype.updateInfo = function(callback) {
  var self = this;
  this.getInfo(function(info) {
    if (!info) {
      callback && callback();
      return;
    }

    if (self.failures > 0) {
      self.failures = 0;
    }

    if (info['role'] === 'master') {
      self.isMaster = true;
      self.master = null;
      self.linkedMaster = false;
    } else  {
      self.isMaster = false;
      self.master = info['master_host'] + ':' + info['master_port'];
      self.linkedMaster = info['master_link_status'] === 'up';
    }
    var slavesCount = parseInt(info['connected_slaves'], 10) || 0;
    self.slaves = [];
    for(var i = 0; i < slavesCount; i++) {
      var ary = info['slave' + i].split(',');
      var status =  ary.pop();
      if (status == "online") {
        self.slaves[i] = ary.join(':');
      }
    }

    self.syncing = info['master_sync_in_progress'] == '1';
    if (self.syncing) {
      logger.warn('%s is syncing with master %s', self.name, self.master);
      setTimeout(function() {
        self.updateInfo();
      }, 10000);
      if (self.available) {
        self.available = false;
        self.emit('unavailable', self);
      }
    } else if (!self.available) {
      self.available = true;
      self.emit('available', self);
    }

    callback && callback();
  });
};

RedisNode.prototype.toJSON = function() {
  return {
    name:         this.name,
    isMaster:     this.isMaster,
    available:    this.available,
    master:       this.master,
    slaves:       this.slaves,
    linkedMaster: this.linkedMaster
  };
};

module.exports = RedisNode;

var zooKeeper = require ("node-zookeeper-client");
var Event = zooKeeper.Event;
var redis = require('redis');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var async = require('async');

// ZooKeeper patch
var DEFAULT_PATH = '/redis_failover';

function Client(opts) {
  EventEmitter.call(this);
  // redis client pool
  this.clientPool = {};
  this.redisState = {};
  this.indexs = {};
  this.zkPath = opts.zkPath || DEFAULT_PATH;
  this.zkClient = null;
  this.logger = opts.logger || console;
  var self = this;

  this.initZK(opts, function() {
    self.logger.info('connect to ZooKeeper success! data: %j', self.redisState);
    self.emit('ready');
  });
}

util.inherits(Client, EventEmitter);


Client.prototype.initZK = function(opts, callback) {
  var self = this;
  var client = zooKeeper.createClient(opts.servers + (opts.chroot || ''));
  var timeout = setTimeout(function() {
    self.logger.warn('connect to zookeeper timeout!');
  }, 15000);

  client.once('connected', function() {
    clearTimeout(timeout);
    self.zkClient = client;
    if (opts.username) {
      client.addAuthInfo('digest', new Buffer(opts.username + ':' + opts.password));
    }
    
    self.getZKChildrenData(function(data) {
      self.onChildrenChange(data, callback);
    });
  });

  client.on('connected', function() {
    self.logger.info('Connected to the Zookeeper server');
  });

  client.on('disconnected', function() {
    self.logger.error('Disconnected to Zookeeper server');
  });

  client.connect();
};

Client.prototype.onChildrenChange = function(data, callback) {
  var self = this;
  if (!callback) {
    callback = function() {};
  }
  async.each(Object.keys(data), function(path, next) {
    self.setState(path, data[path], function() {
      next();
    });
  }, callback);
};

Client.prototype.getZKChildrenData = function(callback) {
  var self = this;
  self.zkClient.getChildren(self.zkPath, function(event) {
    if (event.type == Event.NODE_CHILDREN_CHANGED) {
      self.getZKChildrenData(function(data) {
        self.onChildrenChange(data);
      });
    }
  }, function(err, children) {
    var result = {};
    if (err) {
      self.logger.error('get ZooKeeper children error: %s', err.message);
      return callback(result);
    }
    async.each(children, function(path, next) {
      self.getZKData(path, function(data) {
        if (data) {
          result[path] = data;
        }
        next();
      });
    }, function() {
      callback(result);
    });
  });
};

Client.prototype.getZKData = function(path, callback) {
  var self = this;
  var fullPath = this.zkPath + '/' + path;
  this.zkClient.getData(fullPath, function(err, data) {
    if (err) {
      self.logger.error('get ZooKeeper data error: %s, path: %s', err.message, fullPath);
    }
    if (data) {
      data = data.toString();
      try {
        data = JSON.parse(data);
      } catch (e) {
        self.logger.error('JSON parse ZooKeeper path: %s data: %s error: ', fullPath, data,  e);
        data = null;
      }
    } else {
      self.logger.error('zookeeper data is null! path: %s', fullPath);
    }
    
    callback(data);
  });
};

Client.prototype.watchZkData = function(path) {
  var self = this;
  self.zkClient.getData(self.zkPath + '/' + path, function(event) {
    if (event.type == Event.NODE_DATA_CHANGED) {
      self.getZKData(path, function(data) {
        self.onDataChange(path, data);
      });
    }
    self.watchZkData(path);
  }, function(err) {
    if (err) {
      self.logger.error('watch zookeeper data, path: %s, error: %s', self.zkPath + '/' + path, err.message);
    }
  });
};

// zookeeper data change
Client.prototype.onDataChange = function(path, data) {
  if (!data) return;

  var self = this;
  var expiredState = self.redisState[path];
  self.setState(path, data, function() {
    self.emit('change', path, data);

    if (expiredState.master != data.master) {
      self.emit('masterChange', path, data.master);
    }
  });
};

Client.prototype.setState = function(name, state, callback) {
  var self = this;
  if (!this.redisState[name]) {
    this.watchZkData(name);
  }

  if (!state) {
    callback && callback();
    return;
  }

  this.redisState[name] = state;

  if (state.master) {
    self.addClient(state.master, state.password, callback);
  } else {
    callback && callback();
  }
  if (state.slaves && state.slaves.length > 0) {
    state.slaves.forEach(function(name) {
      self.addClient(name, state.password);
    });
  }
};

Client.prototype.createRedisClient = function(opts, callback) {
  var self = this;
  var options = {retry_max_delay: 30000};
  if (opts.password) {
    options.auth_pass = opts.password;
  }
  var client = redis.createClient(opts.port, opts.host, options);
  client.name = client.host + ':' + client.port; 
  // just for callback
  client.once('ready', function() {
    callback(client);
  });
  client.on('ready', function() {
    self.logger.info('connect to redis %s %s success!', client.server_info.role, client.name);
  });
  client.on('error', function(err) {
    self.emit('error', err);
  });
  client.on('end', function() {
    self.logger.info('redis %s client is end', client.name);
  });
};

Client.prototype.addClient = function(name, password, callback) {
  var self = this;
  var client = self.clientPool[name];
  if (client) {
    if (callback) callback(client);
    return;
  }

  var ary = name.split(':');
  self.createRedisClient({host: ary[0], port: ary[1], password: password}, function(client) {
    self.clientPool[name] = client;
    if (callback) callback(client);
  });
};


//get redis client
Client.prototype.getClient = function(name, role) {
  var state = this.redisState[name];
  var client;

  if (role === 'slave') {
    if (state.slaves.length > 1) {
      var index = this.indexs[name] || 0;
      if (index >= state.slaves.length) {
        index = 0;
      }

      client = this.clientPool[state.slaves[index]];
      index ++;
      this.indexs[name] = index;
    } else {
      client = this.clientPool[state.slaves[0]];
    }

    if (!client || !client.ready) {
      client = this.clientPool[state.master];
    }
  } else {
    client = this.clientPool[state.master];
  }

  return client;
};


module.exports = Client;


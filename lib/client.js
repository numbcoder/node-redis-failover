var zooKeeper = require ("node-zookeeper-client");
var Event = zooKeeper.Event;
var redis = require('redis');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

// ZooKeeper patch
var DEFAULT_PATH = '/redis_failover/redis';

function Client(opts) {
  EventEmitter.call(this);
  // redis client pool
  this.clientPool = {};
  this.zkPath = opts.zkPath || DEFAULT_PATH;
  // redis current state
  this.redisState = null;
  // redis master server client
  this.slaveIndex = 0;
  this.zkClient = null
  var self = this;

  this.createZKClient(opts, function(data) {
    console.info('connect to ZooKeeper success! data: %j', data);
    self.redisState = data;
    self.addClient(self.redisState.master, self.redisState.password, function() {
      console.info('connect to redis master %s success!', self.redisState.master);
      self.emit('ready');
    });
    self.redisState.slaves.forEach(function(name) {
      self.addClient(name, self.redisState.password, function() {
        console.info('connect to redis slave %s success!', name);
      });
    });
  });
}

util.inherits(Client, EventEmitter);


Client.prototype.createZKClient = function(opts, callback) {
  var self = this;
  var client = zooKeeper.createClient(opts.servers + (opts.chroot || ''));
  client.once('connected', function() {
    self.zkClient = client;
    console.info('Connected to the zookeeper server.');
    if (opts.username) {
      client.addAuthInfo('digest', new Buffer(opts.username + ':' + opts.password));
    }

    self.getZKData(function(data) {
      callback(data);
      self.watchZkData();
    }.bind(self));
  });

  client.on('disconnected', function() {
    console.error('disconnected to zookeeper server');
  });

  client.connect();
};

Client.prototype.getZKData = function(callback) {
  this.zkClient.getData(this.zkPath, function(err, data) {
    if (err) {
      console.error('get ZooKeeper data error: %s', err.message);
    }
    if (data) {
      data = data.toString();
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error('JSON parse ZooKeeper data: %s  error: ', data,  e)
        data = null;
      }
    } else {
      console.warn('zookeeper data is null!');
    }
    
    callback(data);
  });
};

Client.prototype.watchZkData = function() {
  var self = this;
  self.zkClient.getData(self.zkPath, function(event) {
    if (event.type == Event.NODE_DATA_CHANGED) {
      self.getZKData(self.onDataChange.bind(self));
    }
    self.watchZkData();
  }, function(err) {
    if (err) {
      console.error('watch zookeeper data error: %s', err.message);
    }
  });
};

// zookeeper data change
Client.prototype.onDataChange = function(data) {
  if (!data) return;
  var self = this;
  var expiredState = self.redisState;
  self.redisState = data;
  console.info('redis state changed, current Redis state: %j', self.redisState);
  self.emit('change');

  if (expiredState.master != self.redisState.master) {
    console.info('Redis master node changed from %s to %s', expiredState.master, self.redisState.master);
    self.emit('masterChange');
  }

  self.addClient(self.redisState.master, self.redisState.password);
  self.redisState.slaves.forEach(function(name) {
    self.addClient(name, self.redisState.password);
  });
};


Client.prototype.createRedisClient = function(opts, callback) {
  var options = {retry_max_delay: 15000};
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
    console.info('connect to redis %s:%s sucess!', opts.host, opts.port);
  });
  client.on('error', function(err) {
    console.error('connect to redis %s:%s error: %s', opts.host, opts.port, err.message);
  });
  client.on('end', function() {
    console.warn('redis %s:%s client is end', opts.host, opts.port);
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
Client.prototype.getClient = function(role) {
  if (role === 'slave') {
    var client = this.clientPool[this.redisState.slaves[this.slaveIndex]];
    this.slaveIndex ++;
    if (this.slaveIndex >= this.redisState.slaves.length) {
      this.slaveIndex = 0;
    }

    if (client && client.ready) {
      return client;
    } else {
      return this.clientPool[this.redisState.master];
    }
  } else {
    return this.clientPool[this.redisState.master];
  }
};

Object.defineProperty(Client.prototype, 'masterClient', {
  get: function() {
    return this.clientPool[this.redisState.master];
  }
});

module.exports = Client;



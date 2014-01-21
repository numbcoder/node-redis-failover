var zooKeeper = require ("node-zookeeper-client");
var CreateMode = zooKeeper.CreateMode;
var Event = zooKeeper.Event;
var Lock = require('./lock');
//var crypto = require('crypto');
var async = require('async');
var logger = require('log4js').getLogger('zookeeper');


function ZK(opts, callback) {
  this.client = zooKeeper.createClient(opts.servers + (opts.chroot || ''));
  var timeout = setTimeout(function() {
    logger.error('connect to zookeeper timeout!');
  }, 15000);

  var self = this;

  this.client.once('connected', function() {
    clearTimeout(timeout);
    if (opts.username) {
      self.client.addAuthInfo('digest', new Buffer(opts.username + ':' + opts.password));
    }
    callback();
  });

  this.client.on('connected', function() {
    logger.info('Connected to the zookeeper server');
  });
  
  this.client.on('disconnected', function() {
    logger.error('Disconnected to zookeeper server');
  });

  this.client.connect();
}

ZK.prototype.close = function() {
  this.client.close();
  this.client.removeAllListeners();
  this.client = null;
};

/*
zk.setACL = function(username, password, path, callback) {
  var shaDigest = crypto.createHash('sha1').update(username + ':' + password).digest('base64');
  var acls = [new zooKeeper.ACL(zooKeeper.Permission.ALL, new zooKeeper.Id('digest', username + ':' + shaDigest))];
  client.setACL(path, acls, callback);
};
*/

ZK.prototype.watchNode = function(path, watcher) {
  this.client.exists(path, watcher, function(err, stat) {
    if (err || !stat) {
      logger.warn('Watch path not exists! path: %j', path);
    }
  });
};

/**
 * @method setData
 * @param path {String}
 * @param value {Object}
 * @param callback {function}
 */
ZK.prototype.setData = function(path, value, callback) {
  var str = '';
  try {
    str = JSON.stringify(value);
  } catch (e) {
    logger.warn(e);
  }
  this.client.setData(path, new Buffer(str), callback);
};

/**
 * @method getData
 * @param path {String}
 * @param [watcher] {Function}
 * @param callback {Function}
 */
ZK.prototype.getData = function(path, watcher, callback) {
  this.client.getData(path, watcher, callback);
};

/**
 *
 * @param path {String}
 * @param watcher {Function}
 */
ZK.prototype.watchData = function(path, watcher) {
  var self = this;
  this.client.getData(path, function(event) {
    if (event.type == Event.NODE_DATA_CHANGED) {
      self.getData(path, function(err, data) {
        try {
          data = JSON.parse(data.toString());
        } catch (e){
          logger.warn(e)
          data = null;
        }
        watcher(data);
      });
    }
  }, function(err) {
    if (err) {
      logger.warn(err);
    }
  });
};

/**
 *
 * @param path {String}
 * @param callback {Function}
 */
ZK.prototype.createLock = function(path, callback) {
  new Lock(this.client, path, callback);
};

ZK.prototype.createEphemeral = function(path, callback) {
  this.client.create(path, CreateMode.EPHEMERAL, callback);
};

ZK.prototype.createPathBatch = function(paths, callback) {
  var self = this;
  async.eachSeries(paths, function(item, callback) {
    self.client.mkdirp(item, function(err) {
      if (err) {
        logger.error('create %s path error: %s', item, err.message);
      } else {
        logger.info('create %s path success!', item);
      }
      callback(err);
    });
  }, callback);
};

ZK.prototype.getChildrenData = function(path, callback) {
  var self = this;
  self.client.getChildren(path, function(err, children) {
    if (err) {
      callback(err);
      return;
    }
    var data = [];
    async.each(children, function(item, callback) {
      self.client.getData(path + "/" + item, function(err, result){
        if (!err && result) {
          data.push(JSON.parse(result));
        }
        callback(err);
      });
    }, function(err) {
      callback(err, data);
    });
  });
};

exports.createClient = function(opts, callback) {
  return new ZK(opts, callback);
};


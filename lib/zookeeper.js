var zooKeeper = require ("node-zookeeper-client");
var CreateMode = zooKeeper.CreateMode;
var Event = zooKeeper.Event;
var Lock = require('./lock');
var crypto = require('crypto');
var async = require('async');
var logger = require('log4js').getLogger('zookeeper');

var zk = module.exports;
var client;

zk.init = function(opts, callback) {
  zk.client = client = zooKeeper.createClient(opts.servers + (opts.chroot || ''));
  var timeout = setTimeout(function() {
    logger.error('connect to zookeeper timeout!');
  }, 10000);

  client.once('connected', function() {
    clearTimeout(timeout);
    if (opts.username) {
      client.addAuthInfo('digest', new Buffer(opts.username + ':' + opts.password));
    }
    callback();
  });

  client.on('connected', function() {
    logger.info('Connected to the zookeeper server');
  });

  client.on('disconnected', function() {
    logger.error('Disconnected to zookeeper server');
  });

  client.connect();
};

zk.setACL = function(username, password, path, callback) {
  var shaDigest = crypto.createHash('sha1').update(username + ':' + password).digest('base64');
  var acls = [new zooKeeper.ACL(zooKeeper.Permission.ALL, new zooKeeper.Id('digest', username + ':' + shaDigest))];
  client.setACL(path, acls, callback);
};

/**
 * @param path {String}
 * @param [value] {String}
 * @param callback {Function}
 */
zk.createNode = function(path, value, callback) {
  var valueType = typeof value;
  if (valueType === 'function') {
    callback = value;
    value = undefined;
  } else if (valueType === 'string') {
    value = new Buffer(value);
  }

  client.exists(path, function(err, stat) {
    if (err) {
      callback(err);
      return;
    }

    //If node exists
    if (stat) {
      callback(null, path, true);
      return;
    }
    client.create(path, value, callback);
  });
};

zk.watchNode = function(path, watcher) {
  client.exists(path, watcher, function(err, stat) {
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
zk.setData = function(path, value, callback) {
  var str = '';
  try {
    str = JSON.stringify(value);
  } catch (e) {
    logger.warn(e);
  }
  client.setData(path, new Buffer(str), callback);
};

/**
 * @method getData
 * @param path {String}
 * @param [watcher] {Function}
 * @param callback {Function}
 */
zk.getData = function(path, watcher, callback) {
  client.getData(path, watcher, callback);
};

/**
 *
 * @param path {String}
 * @param watcher {Function}
 */
zk.watchData = function(path, watcher) {
  client.getData(path, function(event) {
    if (event.type == Event.NODE_DATA_CHANGED) {
      zk.getData(path, function(err, data, stat) {
        try {
          data = JSON.parse(data.toString());
        } catch (e){
          logger.warn(e)
          data = null;
        }
        watcher(data);
      });
    }
  }, function(err, data) {
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
zk.createLock = function(path, callback) {
  new Lock(client, path, callback);
};

zk.createEphemeral = function(path, callback) {
  client.create(path, CreateMode.EPHEMERAL, callback);
};

zk.createPathBatch = function(paths, callback) {
  async.eachSeries(paths, function(item, callback) {
    client.mkdirp(item, function(err) {
      if (err) {
        logger.error('create %s path error: %s', item, err.message);
      } else {
        logger.info('create %s path success!', item);
      }
      callback(err);
    });
  }, callback);
};

zk.getChildrenData = function(path, callback) {
  client.getChildren(path, function(err, children) {
    if (err) {
      callback(err);
      return;
    }
    var data = [];
    async.each(children, function(item, callback) {
      client.getData(path + "/" + item, function(err, result){
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


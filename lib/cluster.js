var async = require('async');
var WatcherManager = require('./watcher_manager');

var watchers = {};
var DELAY = 3200;

var cluster = module.exports = {};

//set up
cluster.setup = function(config) {
  async.eachSeries(config.nodes, function(node, next) {
    node.zooKeeper = config.zooKeeper;
    var name = node.name;
    if (!name || watchers[name]) {
      throw new Error('node name must be unequal!');
    }
    watchers[name] = new WatcherManager(node);

    setTimeout(next, DELAY);
  }, function() {
    console.log('watcher started');
  });
};


// reset node after the config was changed
cluster.reset = function(config) {
  async.eachSeries(config.nodes, function(node, next) {
    var watcher = watchers[node.name];
    if (!watcher) {
      throw new Error('node name can not be modify!');
    }
    node.zooKeeper = config.zooKeeper;
    watcher.resetNode(node);
    
    setTimeout(next, DELAY);
  }, function() {
    console.log('reset config complete!');
  });
}; 



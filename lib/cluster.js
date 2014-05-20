var async = require('async');
var WatcherManager = require('./watcher_manager');

var watchers = {};
var DELAY = 3500;

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
    node.zooKeeper = config.zooKeeper;
    if (!watcher) {
      console.log('add new watcher: %s', node.name);
      watchers[node.name] = new WatcherManager(node);
    } else {
      watcher.resetNode(node);
    }
    
    setTimeout(next, DELAY);
  }, function() {
    console.log('reset config complete!');
  });
}; 



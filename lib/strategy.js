
exports.elect = function(data) {
  var votes = {};
  data.forEach(function(item) {
    item.available.forEach(function(i) {
      if (votes[i] === undefined) votes[i] = 0;
      votes[i] += 1;
    });
    item.unavailable.forEach(function(i) {
      if (votes[i] === undefined) votes[i] = 0;
      votes[i] -= 1;
    });
  });
  var available = [];
  var unavailable = [];
  for (var name in votes) {
    if (votes[name] > 0) {
      available.push(name);
    } else {
      unavailable.push(name);
    }
  }

  return {available: available, unavailable: unavailable};
};

/**
 *
 * @param node {string}
 * @param snapshots {array}
 * @returns {boolean} return true means the node is available if a majority of watchers say this node is available
 */
exports.electNode = function(node, snapshots) {
  var count = 0;
  snapshots.forEach(function(snapshot) {
    if (snapshot.unavailable.indexOf(node) > -1) {
      count -= 1;
    } else {
      count += 1;
    }
  });

  return count > 0;
};


exports.consensus = function() {

};

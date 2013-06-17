var ChangeSet = require('../../lib/ChangeSet');

exports.init = function(redis, changeLog) {

	var changeSet = ChangeSet.create('release-1.0', changeLog);	  	
  	
	changeSet.add('init:foo:bar', function(next) {
		redis.set('foo:bar', 'a', next);
	});

	changeSet.add('init:pirates', function(next) {
		var multi = redis.multi();
		multi.mset(
			'Blackbeard', 'Queen Anne\'s Revenge',					
			'Long John Silver', 'Hispaniola'
		);
		multi.exec(next);
	});

	return changeSet;
};
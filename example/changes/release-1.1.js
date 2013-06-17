var ChangeSet = require('../../lib/ChangeSet');

exports.init = function(redis, changeLog) {

    var changeSet = ChangeSet.create('release-1.1', changeLog);     

    changeSet.add('init:pirates', function(next) {
        var multi = redis.multi();
        multi.mset(
            'Captain Jack Sparrow', 'The Black Pearl'
        );
        multi.exec(next);
    });

    return changeSet;
};
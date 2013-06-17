/*
 * Copyright 2010 Acuminous Ltd
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var _ = require('underscore');
var async = require('async');
var colors = require('colors');
var ChangeLogLock = require('./ChangeLogLock');

module.exports.create = function(options) {

    var prefix = options.prefix;
    var redis = options.redis;
    var logger = options.logger;
    var renderer = options.renderer || require('./ConsoleRenderer');

    var indexKey = [prefix, 'changelog', 'index'].join(':');
    var sequenceKey = [prefix, 'changelog', 'sequence'].join(':');
    var changeLogLock = ChangeLogLock.create({prefix: prefix, redis: redis, logger: logger});
    var lock = changeLogLock.lock;
    var unlock = changeLogLock.unlock

    var changeKey = function(id) {
        return [prefix, 'changelog', 'change', id].join(':');
    }

    var getEntry = function(id, next) {
        var redisKey = changeKey(id);
        redis.hmget(redisKey, 'checksum', 'user', 'timestamp', function(err, values) {
            if (!values[0]) return next(err, null);
            next(err, {
                id: id,
                checksum: values[0],
                user: values[1],
                timestamp: values[2]
            });
        });
    }

    var audit = function(change, next) {
        var key = changeKey(change.id);   
        redis.incr(sequenceKey, function(err, sequence) {
            var multi = redis.multi(sequenceKey);
            multi.hset(key, 'id', change.id);
            multi.hset(key, 'checksum', change.checksum);
            multi.hset(key, 'user', process.env['USER']);
            multi.hset(key, 'timestamp', new Date());
            multi.hset(key, 'sequence', sequence);
            multi.exec(next);
        })  
    }

    var dump = function(next) {
        async.waterfall([
            function(callback) {
                redis.keys(changeKey('*'), callback)
            },
            function(changeKeys, callback) {
                var multi = redis.multi();
                _.each(changeKeys, function(key) {
                    multi.hgetall(key);
                });
                multi.exec(callback);
            },
            function(changes, callback) {
                changes.sort(function(a, b) {
                    return parseInt(a.sequence) > parseInt(b.sequence);
                });
                callback(null, changes)
            }
        ], function(err, changes) {
            if (err) return next(err);
            renderer.render(changes, next);
        });
    }

    var clear = function(partialId, next) {
        logger.info("Clearing changelog [filter=" + partialId + ']');
        lock(function(callback) { 
            var redisKey = changeKey(partialId);
            redis.keys(redisKey, function(err, changes) {                   
                if (err) return callback(err);
                var multi = redis.multi();
                _.each(changes, function(change) {
                    logger.info("Clearing " + change.toString());
                    multi.del(change);
                })
                multi.exec(callback);
            })
        }, next);           
    }   

    return {
        clear: clear,
        audit: audit,
        getEntry: getEntry,
        dump: dump,
        lock: lock,
        unlock: unlock
    }   
};
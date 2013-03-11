# ChangeControl
ChangeControl is a tool for managing automated changes in node applications and was inspired by [liquibase][http://www.liquibase.com]. You might use it to bootstrap your application with reference data, or perform a migration prior to deploying a new release. Without tools like ChangeControl these types of change require human interaction and accumulate to the point where performing a release involves black magic. Creating a new environment requires deep magic from the dawn of time! 

## Dependencies
ChangeControl requires a [Redis][http://www.redis.com] instance to track which changes have been executed. We appreciate this will be a major inconvenience to others, however our project uses Redis, and we wanted something up quickly. Sorry.

## Concepts
Before attempting to use ChangeControl it's worth spending a few minutes to understand it's concepts. At the finest granularity is a Change, which is little more than a JavaScript function and an id.

  Change = Function + Id

You can execute changes, pretend to execute them, or record that you've executed them, even if you haven't (more on why you might want to do this later). Changes are clumped into ChangeSets. We tend to create a single ChangeSet per release.

  ChangeSet = A list of Changes + Id

Just like Changes, you can execute ChangeSet, pretend to execute them or just record that you have. Finally you have the ChangeLog. Every time you execute a Change a record is written to the ChangeLog. 

  ChangeLog = A list of the changes have been executed

Once a Change has been recorded in the ChangeLog it typically won't be executed again. Further more if someone modifies the Change after it has been executed ChangeControl will complain loudly. When you start executing a ChangeSet, it will lock the ChangeLog to ensure two processes can't execute changes at the same time. Once the ChangeSet has been felly applied, the lock is released. This leads to problems when if one of your changes dies or is killed, since the ChangeLog will still be locked. If this happens you need to manually unlock the ChangeLog. You can also view (dump) the ChangeLog or clear it.

## Usage

1. Create a ChangeSet
```js
// changes/release-1.0.js
exports.changeSet = function(changeControl, redis) {

    var changeSet = changeControl.changeSet('release-1.0');     

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
```
1. Initialise ChangeControl
```js
var changeControl = ChangeControl(redis, { logger: console });
```
1. Require the ChangeSet
```js
var changeSet = require('changes/release-1.0').changeSet(changeControl, redis);
```
1. Execute the ChangeSet
```js
changeSet.execute('*', function(err) {
    console.log("Piece of Eight");
})
```

In practice you'll (hopefully) want to execute all the ChangeSets found in the 'changes' directory automatically when your application starts. You'll probabably also want a script for testing the changes locally and for unlocking the ChangeLog when something unexpected happens. You'll find a starter for ten in the examples folder.

### Targetting specific changes
You may have noticed the odd '*' parameter to the changeSet.execute method. This tells the ChangeSet to execute every change. You can change this parameter to be more specific about the change(s) you want to execute, e.g.

```js
changeSet.execute('init:pirates', function(err) {
    console.log("Piece of Eight");
})
```

Would execute just the 'init:pirates'. The sync, pretend and clear operations also expect a similar first paramted.

### Run Always
Sometimes you'll want to run a Change everytime your application starts (e.g. backing up log files). You can do this by specifying frequency = 'always' when you define your Change, e.g.

```js
changeSet.add('init:skullduggery', function(next) {
    // Change Code
}, { frequency: 'always'});
```

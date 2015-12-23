var path 		= require('path');
var fs 			= require('fs');
var events	= require('events');

var dirname = path.dirname;

var watchers = {};
var filectimes = {};
var emitter = new events();

var is = {
	dir: (path, cb) => {
		fs.stat(path, (err, stats) => {
			if (err) {
				return cb(new Error(err));
			}
			cb(null, stats.isDirectory());
		});
	}
}

var scanning = false;
var scanQueue = new Set();

// "stat polling loop". Will call itself until scanQueue is empty.
var scan = () => {
	if (scanning) return;
	if (scanQueue.size == 0) return;
	scanning = true;
	var current = scanQueue[Symbol.iterator]().next().value;
	fs.stat(current, (err, stat) => {
		if (err) {
			console.error(err);
		} else {
			if (filectimes[current].getTime() < stat.ctime.getTime()) {
				emitter.emit(current, current);
			}
			filectimes[current] = stat.ctime;
		}
		scanQueue.delete(current);
		scanning = false;
		scan();
	});
}

// Scans a dir for changed files. Only files associated
// with a watcher for given dir is checked.
var scanForChanges = (dir) => {
	console.log('Scanning', dir);
	var watchedFiles = watchers[dir].files;
	fs.readdir(dir, (err,files) => {
		if (err) {
			return console.error('Watch error', err);
		}
		files.filter(f => watchedFiles.indexOf(f) > -1).forEach((file) => {
			var fullPath = path.join(dir, file);
			if (!scanQueue.has(fullPath)) {
				scanQueue.add(fullPath);
			}
		});
		// start "stat polling"
		scan();
	});
};

var watch = (path, cb) => {
	console.log('Watch', path);
	is.dir(path, (err, isdir) => {
		if (err) {
			console.error('Watch error', err);
			return;
		}

		// only watch dirs, then check files with stat
		var dir = path;
		if (!isdir) {
			dir = dirname(path);
		}
	
		// one watcher per watched dir
		if (!watchers.hasOwnProperty(dir)) {
			var watcher = fs.watch(dir, (change, ignoredFilename) => {
				emitter.emit(dir, dir);
				scanForChanges(dir);
			});
			watchers[dir] = {
				watcher,
				files: []
			};
		}

		// files are just associated to the specific watcher
		if (!isdir) {
			watchers[dir].files.push(path);
			fs.stat(path, (err, stats) => {
				if (err) {
					return console.error(err);
				}
				filectimes[path] = stats.ctime;
			});
		}

		// listen on events for path
		emitter.on(path, cb);
	});
};

module.exports = watch;

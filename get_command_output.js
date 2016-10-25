// share code executing a command and returning its output

import spawn from 'cross-spawn';

export default function get_command_output(executable, options) {
	options = options || {};
	options.params = options.params || [];
	options.timeout = options.timeout || 3000;
	options.env = process.env;
	//options.verbose = true
	//options.merge_stderr

	return new Promise((resolve, reject) => {
		options.verbose && console.log(`Spawn : spawning ${executable}`, options.params.join(' ') || '' );
		const spawn_instance = spawn(executable, options.params, options);
		const radix = 'Spawn#' + spawn_instance.pid;

		console.log(`${radix}: spawned ${executable} ${options.params.join(' ') || ''}${options.cwd ? ' @' + options.cwd : ''}`,  );

		let stdout = ""
		let stderr = ""

		let is_finished = false
		function finish(err = null) {
			if (is_finished) return
			is_finished = true

			if (err) {
				err.message = err.message + ' [err]' + stderr + ' [out]' + stdout
				console.error(`${radix}: ended on error`, err);
				return reject(err)
			}

			if (stderr) {
				const err = new Error('got stderr:' + stderr + ' [out]' + stdout)
				console.error(`${radix}: ended on error`, err);
				return reject(err)
			}

			resolve(stdout.trim())
		}

		spawn_instance.on('error', err => {
			options.verbose && console.log(`${radix}: got err:`, err);
			finish(err);
		});
		spawn_instance.on('close', (code, signal) => {
			options.verbose && console.log(`${radix}: got event close with code "${code}" & signal "${signal}"`)
			if (code !== 0)
				finish(new Error(`Spawn: child process #${spawn_instance.pid} closed with code ${code}`));
			else
				finish()
		});
		spawn_instance.on('disconnect', () => {
			options.verbose && console.log(`${radix}: got disconnect`)
			finish()
		});
		spawn_instance.on('exit', (code, signal) => {
			options.verbose && console.log(`${radix}: got event exit with code "${code}" & signal "${signal}"`)
			if (code !== 0)
				finish(new Error(`Spawn: child process #${spawn_instance.pid} exited with code ${code}`));
			else
				finish()
		});

		if (spawn_instance.stdin) {
			spawn_instance.stdin.on('data', data => {
				options.verbose && console.log(`${radix}: got stdin data event : "${data}"`);
			});
			spawn_instance.stdin.on('error', err => {
				options.verbose && console.log(`${radix}: got stdin error event : "${err}"`);
				finish(err)
			});
		}

		if (spawn_instance.stdout) {
			spawn_instance.stdout.on('data', data => {
				options.verbose && console.log(`${radix}: got stdout data event : "${data}"`);
				stdout += data
			});
			spawn_instance.stdout.on('error', err => {
				options.verbose && console.log(`${radix}: got stdout error event : "${err}"`);
				finish(err)
			});
		}


		if (spawn_instance.stderr) {
			spawn_instance.stderr.on('data', data => {
				options.verbose && console.log(`${radix}: got stderr data event : "${data}"`);
				if (options.merge_stderr)
					stdout += data
				else
					stderr += data
			});
			spawn_instance.stderr.on('error', err => {
				options.verbose && console.log(`${radix}: got stderr error event : "${err}"`);
				finish(err)
			});
		}
	});
}

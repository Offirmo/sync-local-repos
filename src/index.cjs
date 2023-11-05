const path = require('node:path')

const fs = require('@offirmo/cli-toolbox/fs/extra')
const json = require('@offirmo/cli-toolbox/fs/json')
const prettify_json = require('@offirmo/cli-toolbox/string/prettify-json')
const stylize_string = require('@offirmo/cli-toolbox/string/stylize')
const log_symbols = require('@offirmo/cli-toolbox/string/log-symbols')
const meow = require('@offirmo/cli-toolbox/framework/meow')
const tildify = require('@offirmo/cli-toolbox/string/tildify')

const { execute_and_throw } = require('./get_command_output.cjs')


require('@offirmo/cli-toolbox/stdout/clear-cli')()

/////////////////////////////////////////////////

// repos in those branches are not considered "in branch"
const STANDARD_BRANCHES = [
	'gh-pages',
	'main',
	'master',
	'stable',
]

const cli = meow(`
    Options
      --dry-run  don't touch anything
      --dry-git  don't do active git commands
      --dry-npm  don't do active npm commands

    Examples
      $ node ./src/index.cjs ../.. --dry-run
`)

const root_dir_we_will_search_in = cli.input[0]
const options = cli.flags
options.depth = 0
let repo_dirs = []
const repos = []
const reposⵧoffirmo = []
const reposⵧdirty = []
const reposⵧon_nonstandard_branch = []
const reposⵧwith_stashes = []

console.log('* path:', root_dir_we_will_search_in)
console.log('* options:', options)

console.log('* Gathering list of repos...')
repo_dirs = fs.lsDirs(root_dir_we_will_search_in).map(repo_dir => path.join(root_dir_we_will_search_in, repo_dir))

console.log('* Processing repos...')
Promise.all(
		repo_dirs
			//.slice(1, 2) // DEBUG
			.map(repo_dir => process_dir(repo_dir, options)),
	)
	.then(function display_results() {
		console.log(`-------------------------------------------`)
		console.log(log_symbols.success + stylize_string.bold(` Seen ${repos.length} repositories:`))
		if (repos.length === 0) {
			console.log(stylize_string.bold.red('NONE please check invocation parameters!'))
			return
		}

		repos.sort().forEach(repo_dir => {
			let error_level = 0 // so far. 0 = no issues 1 = warnings 2 = err

			let lines = [ `📦 ${repo_dir}` ]

			if (reposⵧoffirmo.includes(repo_dir))
				lines[0] += `  << OFFIRMO`

			if (reposⵧdirty.includes(repo_dir)) {
				error_level = 2
				lines.push(`   ❗ DIRTY`)
			}

			if (reposⵧon_nonstandard_branch.includes(repo_dir)) {
				error_level = Math.max(error_level, 1)
				lines.push(`   🔥 on a non-standard branch`)
			}

			if (reposⵧwith_stashes.includes(repo_dir)) {
				error_level = Math.max(error_level, 1)
				lines.push(`   🔥 has stashes`)
			}

			let logger = null
			switch (error_level) {
				case 0: {
					logger = function (line) {
						console.log(stylize_string.green(line))
					}
					break
				}
				case 1: {
					logger = function (line) {
						console.warn(stylize_string.bold.yellow(line))
					}
					break
				}
				default:
					logger = function (line) {
						console.error(stylize_string.bold.red(line))
					}
					break
			}

			lines.forEach(logger)
		})

		/*
				console.log(stylize_string.bold(`${log_symbols.success} Seen Offirmo’s repositories:`))
				if (reposⵧoffirmo.length === 0) {
					console.log(stylize_string.bold.red("NONE"))
				}
				else {
					console.log(stylize_string.bold.green(prettify_json(reposⵧoffirmo)))
				}

				if (reposⵧdirty.length === 0) {
					console.log(stylize_string.bold.green(`${log_symbols.success} You have NO dirty repos.`))
				}
				else {
					console.log(stylize_string.bold(`${log_symbols.warning} You have dirty repos:`))
					console.log(stylize_string.bold.red(prettify_json(reposⵧdirty)))
				}

				if (reposⵧon_nonstandard_branch.length === 0) {
					console.log(stylize_string.bold.green(`${log_symbols.success} You have NO repos on a branch.`))
				}
				else {
					console.log(stylize_string.bold(`${log_symbols.warning} You have repos in a branch:`))
					console.log(stylize_string.bold.yellow(prettify_json(reposⵧon_nonstandard_branch)))
				}

				if (reposⵧwith_stashes.length === 0) {
					console.log(stylize_string.bold.green(`${log_symbols.success} You have NO repos with stashes.`))
				}
				else {
					console.log(stylize_string.bold(`${log_symbols.warning} You have repos with stashes:`))
					console.log(stylize_string.bold.yellow(prettify_json(reposⵧwith_stashes)))
				}
		*/
		console.log('Done.')
		console.log('will exit in 3s...')
		setTimeout(() => process.exit(0), 3000)
	})
	.catch((err) => {
		console.error(stylize_string.bold.red(log_symbols.error + prettify_json(err)))
		//cli.showHelp(1)
		process.exit(1)
	})


function process_dir(dir, options) {
	console.log('* processing repo ' + tildify(dir))

	let is_git_repo = true // so far
	let is_js_package = true

	const preconditions = Promise.resolve(true)
		.then(() => {
			console.log(`  Checking if is a git repo: "${dir}"`)
			return execute_and_throw(`test`, {
				params: '-d .git'.split(' '),
				cwd: dir,
			})
				.catch(() => is_git_repo = false)
		})
		.then(() => {
			console.log(`  Checking if is a JS package: "${dir}"`)
			return execute_and_throw(`test`, {
				params: '-f package.json'.split(' '),
				cwd: dir,
			})
				.catch(() => is_js_package = false)
		})

	const actions = preconditions
		.then(() => {
			if (!is_git_repo) {
				// let's recurse
				if (options.depth < 1) {
					const subdirs = fs.lsDirs(dir).map(repo_dir => path.join(dir, repo_dir))
					const sub_options = Object.assign({}, options, { depth: options.depth + 1 })
					return Promise.all(
						subdirs
							.map(repo_dir => process_dir(repo_dir, sub_options)),
					)
				}

				return console.log(`  ${log_symbols.info} "${dir}" skipping git operations since not a git repo`)
			}

			repos.push(dir)

			if (options.dryRun)
				return console.log(`  ${log_symbols.warning} "${dir}" skipping git operations due to dry run`)

			return update_git_related(dir, options)
				.then(() => {
					if (!is_js_package)
						return console.log(`  ${log_symbols.info} "${dir}" skipping npm operations since not a npm package`)
					if (options.dryRun)
						return console.log(`  ${log_symbols.warning} "${dir}" skipping npm operations due to dry run`)
					return update_npm_related(dir, options)
				})
		})

	return actions
}


function update_git_related(repo_dir, options) {
	console.log('  update_git_related()', tildify(repo_dir), options)

	let git_branch = ''
	let is_repo_dirty = false // so far

	const observations = Promise.resolve(true)
		.then(() => {
			console.log(`  Checking git branch of "${repo_dir}"`)
			return execute_and_throw(`git`, {
				params: 'rev-parse --abbrev-ref HEAD'.split(' '),
				cwd: repo_dir,
			})
				.then(({ stdout }) => {
					git_branch = stdout
					console.log(stylize_string.dim(`  » git branch for "${repo_dir}" is "${git_branch}"`))
					if (!STANDARD_BRANCHES.includes(git_branch)) {
						reposⵧon_nonstandard_branch.push(`${repo_dir} -> branch "${git_branch}"`)
					}
				})
		})
		.then(() => {
			console.log(`  Checking git dirtiness of "${repo_dir}"`)
			return execute_and_throw(`git`, {
				params: 'diff-index --quiet HEAD --'.split(' '),
				cwd: repo_dir,
			})
				.catch((err) => {
					reposⵧdirty.push(repo_dir)
					is_repo_dirty = true
					console.log(stylize_string.bold.yellow(`  ${log_symbols.warning} "${repo_dir}" is dirty (from return code: "${err.message}")\n${err.stderr}`))
				})
		})
		.then(() => {
			console.log(`  Checking git stashes for "${repo_dir}"`)
			return execute_and_throw(`git`, {
				params: 'stash list'.split(' '),
				cwd: repo_dir,
			})
				.then(({ stdout }) => {
					stdout = stdout.trim()
					if (stdout.length) {
						//console.log(`git stash output`, stdout) // TODO store the stashes name for display later
						reposⵧwith_stashes.push(repo_dir)
						console.log(stylize_string.bold.yellow(`  ${log_symbols.warning} "${repo_dir}" has stashes!`))
					}
				})
				.catch((err) => {
					console.log(stylize_string.bold.yellow(`  ${log_symbols.warning} "${repo_dir}" XXX git stash ??? "${err.message}"\n${err.stderr}`))
				})
		})
	//git log origin/master..master


	const actions = observations
		.then(() => {
			if (options.dryGit)
				return console.log(`  ${log_symbols.warning} "${repo_dir}" skipping git fetch due to dry git`)
			console.log(`  git fetch for "${repo_dir}"`)
			return execute_and_throw(`git`, {
				params: 'fetch'.split(' '),
				//stdio: ['pipe', process.stdout, 'pipe' ],
				cwd: repo_dir,
				merge_stderr: true,
			})
				.then(({ stdout }) => {
					if (stdout) console.log(stylize_string.dim(`  » git fetch for "${repo_dir}" => "${stdout}"`))
				})
				.catch((err) => {
					console.log(stylize_string.bold.red(`  ${log_symbols.warning} "${repo_dir}" couldn't be fetched due to "${err.message}"\n${err.stderr}`))
				})
		})
		.then(() => {
			if (is_repo_dirty)
				return console.log(`  ${log_symbols.warning} "${repo_dir}" skipping git pull since repo is dirty`)
			if (options.dryGit)
				return console.log(`  ${log_symbols.warning} "${repo_dir}" skipping git pull due to dry git`)

			console.log(`  git pull for "${repo_dir}"`)
			return execute_and_throw(`git`, {
				params: 'pull'.split(' '),
				//stdio: ['pipe', process.stdout, 'pipe' ],
				cwd: repo_dir,
				merge_stderr: true,
			})
				.then(({ stdout }) => {
					if (stdout) console.log(stylize_string.dim(`  » git pull for "${repo_dir}" => "${stdout}"`))
				})
				.catch(err => {
					if (err.stdout.includes('There is no tracking information')) return // swallow
					console.log(stylize_string.bold.red(`  ${log_symbols.warning} "${repo_dir}" couldn't be pulled due to "${err.message}"\n${err.stderr}`))
				})
		})

	return actions
}


function update_npm_related(mod_dir, options) {
	console.log('  update_npm_related()', tildify(mod_dir), options)

	const package_json_path = path.join(mod_dir, 'package.json')
	let package_json

	const observations = Promise.resolve(true)
		.then(() => {
			console.log(`  Reading package.json ${tildify(package_json_path)}`)
			return json.read(package_json_path)
				.then(s => package_json = s)
		})

	// delete npm modules for backup
	/*observations
		.then(() => {
			if (package_json.name !== "sync-local-repos")
				xxx

		})*/


	const actions = observations
		.then(() => {
			// we used to do "npm link" here
			// but not anymore since switched to a monorepo
			/*
			console.log(`  npm link for "${mod_dir}"`)
			return execute_and_throw(`npm`, {
					params: 'link'.split(' '),
					//stdio: ['pipe', process.stdout, 'pipe' ],
					cwd: mod_dir,
					merge_stderr: true
				})
				.then(({stdout}) => {if (stdout) console.log(stylize_string.dim(stdout))})
				.catch(err => console.log(stylize_string.yellow.bold(`  ${log_symbols.warning} npm link for "${mod_dir}" failed but don't really care`)))
			*/
		})

	return actions
}

#!/bin/sh
':' //# http://sambal.org/?p=1014 ; exec `dirname $0`/node_modules/.bin/babel-node "$0" "$@"
'use strict';

import get_command_output from './get_command_output';


console.log('Hello world !')


const path = require('path')
const _ = require('@offirmo/cli-toolbox/lodash')
const visual_tasks = require('@offirmo/cli-toolbox/stdout/visual_tasks')
const fs = require('@offirmo/cli-toolbox/fs/extra')
const json = require('@offirmo/cli-toolbox/fs/json')
const prettify_json = require('@offirmo/cli-toolbox/string/prettify-json')
const stylize_string = require('@offirmo/cli-toolbox/string/stylize')
const log_symbols = require('@offirmo/cli-toolbox/string/log-symbols')
const meow = require('@offirmo/cli-toolbox/framework/meow')
const tildify = require('@offirmo/cli-toolbox/string/tildify')

require('@offirmo/cli-toolbox/stdout/clear-cli')()

let REPO_DIRS = []

const cli = meow(`
    Usage
      $ ./index.js <path>

    Options
      --dry-run  don't touch anything
      --dry-git  don't do active git commands
      --dry-npm  don't do active npm commands

    Examples
      $ ./index.js .. --dry-run
`)

const repos_parent_dir = cli.input[0]
const options = cli.flags
const DEV_NPM_MODULES = []
const DIRTY_REPOS = []

console.log('* path:', repos_parent_dir)
console.log('* options:', options)

console.log('* Gathering list of repos...')
REPO_DIRS = fs.lsDirs(repos_parent_dir).map(repo_dir => path.join(repos_parent_dir, repo_dir))
console.log('* Processing repos...')
Promise.all(
	REPO_DIRS
		//.slice(0, 1)
		.map(repo_dir => process_dir(repo_dir, options))
)
.then(res => {
	if (DEV_NPM_MODULES.length) console.log(`${log_symbols.warning} TOD link dev npm modules:\n` + stylize_string.red.bold(prettify_json(DEV_NPM_MODULES)))
})
.then(res => {
	if (DIRTY_REPOS.length) console.log(`${log_symbols.warning} You have dirty repos:\n` + stylize_string.red.bold(prettify_json(DIRTY_REPOS)))
})
.then(res => {
	console.log('Done.')
	console.log('will exit in 3s...')
	setTimeout(() => process.exit(0), 3000)
})
.catch((err) => {
	console.error(stylize_string.red.bold(log_symbols.error + prettify_json(err)))
	//cli.showHelp(1)
	process.exit(1)
})


function process_dir(dir, options) {
	console.log('* processing repo ' + tildify(dir))

	let is_git_repo = true
	let is_npm_module = true

	const preconditions = Promise.resolve(true)
		.then(() => {
			console.log(`  Checking if git repo: "${dir}"`)
			return get_command_output(`test`, {
				params: '-d .git'.split(' '),
				cwd: dir
			})
				.catch(() => is_git_repo = false)
		})
		.then(() => {
			console.log(`  Checking if npm module: "${dir}"`)
			return get_command_output(`test`, {
				params: '-f package.json'.split(' '),
				cwd: dir
			})
				.catch(() => is_npm_module = false)
		})

		const actions = preconditions
			.then(() => {
				if (!is_git_repo)
					return console.log(`  ${log_symbols.info} "${dir}" skipping git operations since not a git repo`)
				if (options.dryRun)
					return console.log(`  ${log_symbols.warning} "${dir}" skipping git operations due to dry run`)
				return update_git_related(dir, options)
			})
			.then(() => {
				if (!is_npm_module)
					return console.log(`  ${log_symbols.info} "${dir}" skipping npm operations since not a npm module`)
				if (options.dryRun)
					return console.log(`  ${log_symbols.warning} "${dir}" skipping npm operations due to dry run`)
				return update_npm_related(dir, options)
			})

		return actions
}


function update_git_related(repo_dir, options) {
	console.log('  update_git_related', tildify(repo_dir), options)

	let git_branch
	let is_repo_dirty = false

	const observations = Promise.resolve(true)
		.then(() => {
			console.log(`  Checking git branch of "${repo_dir}"`)
			return get_command_output(`git`, {
				params: 'rev-parse --abbrev-ref HEAD'.split(' '),
				cwd: repo_dir
			})
			.then(data => git_branch = data)
		})
		.then(() => {
			console.log(`  Checking git dirtiness of "${repo_dir}"`)
			return get_command_output(`git`, {
				params: 'diff-index --quiet HEAD --'.split(' '),
				cwd: repo_dir
			})
			.catch((err) => {
				DIRTY_REPOS.push(repo_dir)
				is_repo_dirty = true
				console.log(`  "${repo_dir}" is dirty due to`, err)
			})
		})


	const actions = observations
		.then(() => {
			if (options.dryGit)
				return console.log(`  ${log_symbols.warning} "${repo_dir}" skipping git fetch due to dry git`)
			console.log(`  git fetch for "${repo_dir}"`)
			return get_command_output(`git`, {
					params: 'fetch'.split(' '),
					//stdio: ['pipe', process.stdout, 'pipe' ],
					cwd: repo_dir,
					merge_stderr: true
				})
				.then(output => console.log(stylize_string.dim(`» git fetch for "${repo_dir}" =>\n${output}`)))
		})
		.then(() => {
			if (is_repo_dirty)
				return console.log(`  ${log_symbols.warning} "${repo_dir}" skipping git pull since repo is dirty`)
			if (options.dryGit)
				return console.log(`  ${log_symbols.warning} "${repo_dir}" skipping git pull due to dry git`)

			console.log(`  git pull for "${repo_dir}"`)
			return get_command_output(`git`, {
					params: 'pull'.split(' '),
					//stdio: ['pipe', process.stdout, 'pipe' ],
					cwd: repo_dir,
					merge_stderr: true
				})
				.then(output => console.log(stylize_string.dim(`» git pull for "${repo_dir}" =>\n${output}`)))
				.catch(err => {
					if (err.message.includes('There is no tracking information')) return // swallow
					throw err
				})
		})

	return actions
}


function update_npm_related(mod_dir, options) {
	console.log('  update_npm_related', tildify(mod_dir), options)

	const package_json_path = path.join(mod_dir, 'package.json')
	let package_json

	const observations = Promise.resolve(true)
		.then(() => {
			console.log(`  Reading package.json ${tildify(package_json_path)}`)
			return json.read(package_json_path)
				.then(s => package_json = s)
		})

	const actions = observations
			.then(() => {
			if (!_.isString(package_json.author) || !package_json.author.includes('Offirmo'))
				return console.log(`  ${log_symbols.info} "${mod_dir}" skipping npm link since author != Offirmo`, package_json.author)
			if (options.dryNpm)
				return console.log(`  ${log_symbols.warning} "${mod_dir}" skipping npm link due to dry npm`)

			DEV_NPM_MODULES.push(package_json.name)

			console.log(`  npm link for "${mod_dir}"`)
			return get_command_output(`npm`, {
					params: 'link'.split(' '),
					//stdio: ['pipe', process.stdout, 'pipe' ],
					cwd: mod_dir,
					merge_stderr: true
				})
				.then(output => console.log(stylize_string.dim(output)))
		})

	return actions
}

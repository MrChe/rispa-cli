const spawn = require('cross-spawn')
const { DEFAULT_PLUGIN_BRANCH } = require('../constants')

const REMOTE_REGEXP = /([^\s]+)\s+([^\s]+)\s+\((\w+)\)/g

const defaultSpawnOptions = cwd => ({ cwd, stdio: 'inherit' })

const cloneRepository = (path, cloneUrl) => {
  const result = spawn.sync(
    'git',
    ['clone', cloneUrl],
    defaultSpawnOptions(path)
  )

  if (result.status !== 0) {
    throw new Error('Can\'t clone repository')
  }

  return result
}

const pullRepository = path => (
  spawn.sync(
    'git',
    ['pull'],
    defaultSpawnOptions(path)
  ).status === 0
)

const addRemote = (path, remoteName, remoteUrl) => (
  spawn.sync(
    'git',
    ['remote', 'add', remoteName, remoteUrl],
    defaultSpawnOptions(path)
  ).status === 0
)

const removeRemote = (path, remoteName) => (
  spawn.sync(
    'git',
    ['remote', 'rm', remoteName],
    defaultSpawnOptions(path)
  ).status === 0
)

const getRemotes = path => {
  const result = spawn.sync(
    'git',
    ['remote', '-v'],
    { cwd: path, stdio: 'pipe' }
  )

  if (result.status === 1) {
    throw new Error('Can\'t get remotes')
  }

  const output = String(result.output[1])
  const remotes = {}

  let match = REMOTE_REGEXP.exec(output)
  while (match) {
    const [, remoteName, remoteUrl, action] = match
    if (!remotes[remoteName]) {
      remotes[remoteName] = {}
    }
    remotes[remoteName][action] = remoteUrl
    match = REMOTE_REGEXP.exec(output)
  }

  return remotes
}

const addSubtree = (path, prefix, remoteName, remoteUrl) => (
  addRemote(path, remoteName, remoteUrl) &&
  spawn.sync(
    'git',
    ['subtree', 'add', `--prefix=${prefix}`, remoteName, DEFAULT_PLUGIN_BRANCH],
    defaultSpawnOptions(path)
  ).status === 0
)

const updateSubtree = (path, prefix, remoteName, remoteUrl) => (
  addRemote(path, remoteName, remoteUrl) &&
  spawn.sync(
    'git',
    ['subtree', 'pull', `--prefix=${prefix}`, remoteName, DEFAULT_PLUGIN_BRANCH],
    defaultSpawnOptions(path)
  ).status === 0
)

const init = (path, remoteUrl) => {
  let success = spawn.sync(
    'git',
    ['init'],
    defaultSpawnOptions(path)
  ).status === 0

  if (success && remoteUrl) {
    success = addRemote(path, 'origin', remoteUrl)
  }
  return success
}

const commit = (path, message) => {
  const options = defaultSpawnOptions(path)
  return spawn.sync('git', ['add', '.'], options).status === 0 &&
    spawn.sync('git', ['commit', '-m', message], options).status === 0
}

const push = path => (
  spawn.sync(
    'git',
    ['push'],
    defaultSpawnOptions(path)
  ).status === 0
)

const getChanges = path => {
  const result = spawn.sync(
    'git',
    ['status', '--porcelain'],
    {
      cwd: path,
      stdio: 'pipe',
    }
  )

  return result.status === 0 && String(result.output[1])
}

const getLastTagDescription = path => (
  spawn.sync(
    'git',
    ['describe', '--tags', '--long', '--match', 'v*'],
    {
      cwd: path,
      stdio: 'pipe',
    }
  )
)

const tagInfo = path => {
  const result = getLastTagDescription(path)
  const tagDescription = result.status !== 1 && String(result.output[1])
  if (!tagDescription) {
    return null
  }

  const parts = /v((\d+).(\d+).(\d+))-(\d+)-\w+/.exec(tagDescription)
  const [version, major, minor, patch, newCommitsCount] = parts.slice(1)

  return {
    version,
    versionParts: {
      major,
      minor,
      patch,
    },
    newCommitsCount,
  }
}

const addTag = (path, tag) => {
  const spawnOptions = defaultSpawnOptions(path)
  return spawn.sync('git', ['tag', tag], spawnOptions).status === 0 &&
    spawn.sync('git', ['push', '--tags'], spawnOptions).status === 0
}

module.exports = {
  cloneRepository,
  pullRepository,
  addSubtree,
  updateSubtree,
  init,
  commit,
  push,
  removeRemote,
  getRemotes,
  getChanges,
  tagInfo,
  addTag,
}
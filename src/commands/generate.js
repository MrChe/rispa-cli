const path = require('path')
const chalk = require('chalk')
const { prompt } = require('inquirer')
const configureGenerators = require('@rispa/generator')
const Command = require('../Command')
const readProjectConfiguration = require('../tasks/readProjectConfiguration')
const scanPlugins = require('../tasks/scanPlugins')
const bootstrapProjectDeps = require('../tasks/bootstrapProjectDeps')
const { findPluginByName, getPluginName } = require('../utils/plugin')

const initGenerators = ctx => {
  const generatorsPaths = Object.values(ctx.plugins)
    .filter((plugin, idx, plugins) => plugins.indexOf(plugin) === idx)
    .map(({ generators }) => generators)

  const generators = configureGenerators(ctx.projectPath, generatorsPaths)

  if (generators.getGeneratorList().length === 0) {
    throw new Error('Can\'t find generators')
  }

  ctx.generators = generators
}

class GenerateCommand extends Command {
  constructor([generatorName, pluginName], options) {
    super(options)

    this.state = {
      plugin: null,
      pluginName,
      generatorName,
    }

    this.selectPlugin = this.selectPlugin.bind(this)
    this.selectGenerator = this.selectGenerator.bind(this)
    this.runGenerator = this.runGenerator.bind(this)
    this.checkPlugin = this.checkPlugin.bind(this)
    this.checkGenerator = this.checkGenerator.bind(this)
    this.enterPluginName = this.enterPluginName.bind(this)
  }

  checkPlugin(ctx) {
    const { pluginName } = this.state

    const plugin = findPluginByName(ctx.plugins, pluginName)

    if (!plugin) {
      throw new Error(`Can't find plugin with name ${chalk.cyan(pluginName)}`)
    }

    this.state.plugin = plugin
  }

  checkGenerator(ctx) {
    const { generatorName } = this.state
    const { generators } = ctx

    if (!generators.containsGenerator(generatorName)) {
      throw new Error(`Can't find generator with name ${chalk.cyan(generatorName)}`)
    }

    const generator = generators.getGenerator(generatorName)
    ctx.generator = generator
  }

  selectPlugin(ctx) {
    return prompt([{
      type: 'list',
      name: 'plugin',
      message: 'Select plugin:',
      paginated: true,
      choices: ctx.plugins.map(plugin => ({
        name: getPluginName(plugin), value: plugin,
      })),
    }]).then(({ plugin }) => {
      this.state.plugin = plugin
    })
  }

  enterPluginName() {
    return prompt([{
      type: 'input',
      name: 'pluginName',
      message: 'Enter plugin name:',
    }]).then(({ pluginName }) => {
      this.state.pluginName = pluginName
    })
  }

  selectGenerator({ generators }) {
    return prompt([{
      type: 'list',
      name: 'generatorName',
      message: 'Select generator:',
      paginated: true,
      choices: generators.getGeneratorList(),
    }]).then(({ generatorName }) => {
      this.state.generatorName = generatorName
    })
  }

  runGenerator(ctx) {
    const { pluginName, plugin } = this.state
    const { projectPath, generators, generator, configuration } = ctx

    let destPath
    if (generator.isFeatureGenerator) {
      const pluginsPath = path.resolve(projectPath, configuration.pluginsPath)
      destPath = path.resolve(pluginsPath, pluginName, './plopfile.js')
    } else {
      destPath = path.resolve(plugin.path, './plopfile.js')
    }

    // # nasty hack to set destination folder for generator
    generators.setPlopfilePath(destPath)

    return generator.runPrompts()
      .then(data => generator.runActions(Object.assign({ pluginName }, data)))
      .then(result => {
        if (result.failures && result.failures.length) {
          const error = result.failures
            .map(failure => `${failure.path}: ${failure.error}`)
            .join('\n')

          throw new Error(error)
        } else {
          return Promise.resolve()
        }
      })
  }

  init() {
    const { pluginName, generatorName } = this.state

    return [
      readProjectConfiguration,
      scanPlugins,
      {
        title: 'Check plugin',
        enabled: () => pluginName,
        task: this.checkPlugin,
      },
      {
        title: 'Init generators',
        task: initGenerators,
      },
      {
        title: 'Select generator',
        enabled: () => !generatorName,
        task: this.selectGenerator,
      },
      {
        title: 'Check generator',
        task: this.checkGenerator,
      },
      {
        title: 'Select plugin',
        enabled: () => !pluginName,
        skip: ctx => ctx.generator.isFeatureGenerator,
        task: this.selectPlugin,
      },
      {
        title: 'Enter plugin name',
        enabled: () => !pluginName,
        skip: ctx => !ctx.generator.isFeatureGenerator,
        task: this.enterPluginName,
      },
      {
        title: 'Run generator',
        task: this.runGenerator,
      },
      {
        title: 'Bootstrap plugin dependencies',
        skip: ctx => !ctx.generator.isFeatureGenerator,
        task: bootstrapProjectDeps.task,
      },
    ]
  }
}

GenerateCommand.commandName = 'g'
GenerateCommand.commandDescription = 'Run generator'

module.exports = GenerateCommand

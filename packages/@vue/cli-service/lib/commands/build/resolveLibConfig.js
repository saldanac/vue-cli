const fs = require('fs')
const path = require('path')

module.exports = (api, { entry, name }, options) => {
  // setting this disables app-only configs
  process.env.VUE_CLI_TARGET = 'lib'
  // inline all static asset files since there is no publicPath handling
  process.env.VUE_CLI_INLINE_LIMIT = Infinity

  const { log, error } = require('@vue/cli-shared-utils')
  const abort = msg => {
    log()
    error(msg)
    process.exit(1)
  }

  if (!fs.existsSync(api.resolve(entry))) {
    abort(
      `Failed to resolve lib entry: ${entry}${entry === `src/App.vue` ? ' (default)' : ''}. ` +
      `Make sure to specify the correct entry file.`
    )
  }

  const isVueEntry = /\.vue$/.test(entry)
  const libName = (
    name ||
    api.service.pkg.name ||
    path.basename(entry).replace(/\.(jsx?|vue)$/, '')
  )

  function genConfig (format, postfix = format, genHTML) {
    const config = api.resolveChainableWebpackConfig()

    // adjust css output name so they write to the same file
    if (config.plugins.has('extract-css')) {
      config
        .plugin('extract-css')
          .tap(args => {
            args[0].filename = `${libName}.css`
            return args
          })
    }

    // only minify min entry
    if (!/\.min/.test(postfix)) {
      config.optimization.minimize(false)
    }

    // externalize Vue in case user imports it
    config
      .externals({
        vue: {
          commonjs: 'vue',
          commonjs2: 'vue',
          root: 'Vue'
        }
      })

    // inject demo page for umd
    if (genHTML) {
      const template = isVueEntry ? 'demo-lib.html' : 'demo-lib-js.html'
      config
        .plugin('demo-html')
          .use(require('html-webpack-plugin'), [{
            template: path.resolve(__dirname, template),
            inject: false,
            filename: 'demo.html',
            libName
          }])
    }

    // resolve entry/output
    const entryName = `${libName}.${postfix}`
    config.resolve
      .alias
        .set('~entry', api.resolve(entry))

    // set entry/output after user configureWebpack hooks are applied
    const rawConfig = api.resolveWebpackConfig(config)

    rawConfig.entry = {
      [entryName]: require.resolve('./entry-lib.js')
    }

    rawConfig.output = Object.assign({
      library: libName,
      libraryExport: isVueEntry ? 'default' : undefined,
      libraryTarget: format,
      // preserve UDM header from webpack 3 until webpack provides either
      // libraryTarget: 'esm' or target: 'universal'
      // https://github.com/webpack/webpack/issues/6522
      // https://github.com/webpack/webpack/issues/6525
      globalObject: `typeof self !== 'undefined' ? self : this`
    }, rawConfig.output, {
      filename: `${entryName}.js`,
      chunkFilename: `${entryName}.[name].js`,
      // use dynamic publicPath so this can be deployed anywhere
      // the actual path will be determined at runtime by checking
      // document.currentScript.src.
      publicPath: ''
    })

    return rawConfig
  }

  return [
    genConfig('commonjs2', 'common'),
    genConfig('umd', undefined, true),
    genConfig('umd', 'umd.min')
  ]
}

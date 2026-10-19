import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix'
  },
  pack: {
    deps: {
      resolveDepSubpath: true
    },
    minify: true,
    platform: 'neutral',
    dts: true,
    exports: true
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true
    }
  },
  fmt: {
    semi: false,
    sortImports: {},
    singleQuote: true,
    trailingComma: 'none',
    jsxSingleQuote: true
  }
})

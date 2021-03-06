'use strict'

const postcss = require('postcss')
const pxRegex = require('./lib/pixel-unit-regex')
const filterPropList = require('./lib/filter-prop-list')

const defaults = {
  unitPrecision: 5,
  selectorBlackList: [],
  propList: ['*'],
  replace: true,
  mediaQuery: false,
  minPixelValue: 0,
  remtorpxBase: 100  // rem 转 rpx 的比例
}


let targetUnit = 'rpx'

module.exports = postcss.plugin('postcss-remtorpx', function (options) {

  const opts = Object.assign({}, defaults, options)
  const onePxTransform = typeof options.onePxTransform === 'undefined' ? true : options.onePxTransform
  const pxReplace = createPxReplace(opts.remtorpxBase, opts.unitPrecision,
    opts.minPixelValue, onePxTransform)

  const satisfyPropList = createPropListMatcher(opts.propList)

  return function (css) {
    for (let i = 0; i < css.nodes.length; i++) {
      if (css.nodes[i].type === 'comment') {
        if (css.nodes[i].text === 'postcss-remtorpx disable') {
          return
        } else {
          break
        }
      }
    }

    /*  #ifdef  %PLATFORM%  */
    // 平台特有样式
    /*  #endif  */
    css.walkComments(comment => {
      const wordList = comment.text.split(' ')
      // 指定平台保留
      if (wordList.indexOf('#ifdef') > -1) {
        // 非指定平台
        if (wordList.indexOf(options.platform) === -1) {
          let next = comment.next()
          while (next) {
            if (next.type === 'comment' && next.text.trim() === '#endif') {
              break
            }
            const temp = next.next()
            next.remove()
            next = temp
          }
        }
      }
    })

    /*  #ifndef  %PLATFORM%  */
    // 平台特有样式
    /*  #endif  */
    css.walkComments(comment => {
      const wordList = comment.text.split(' ')
      // 指定平台剔除
      if (wordList.indexOf('#ifndef') > -1) {
        // 指定平台
        if (wordList.indexOf(options.platform) > -1) {
          let next = comment.next()
          while (next) {
            if (next.type === 'comment' && next.text.trim() === '#endif') {
              break
            }
            const temp = next.next()
            next.remove()
            next = temp
          }
        }
      }
    })

    css.walkDecls(function (decl, i) {
      // This should be the fastest test and will remove most declarations
      if (decl.value.indexOf('rem') === -1) return

      if (!satisfyPropList(decl.prop)) return

      if (blacklistedSelector(opts.selectorBlackList,
        decl.parent.selector)) return

      const value = decl.value.replace(pxRegex, pxReplace)

      // if rem unit already exists, do not add or replace
      if (declarationExists(decl.parent, decl.prop, value)) return

      if (opts.replace) {
        decl.value = value
      } else {
        decl.parent.insertAfter(i, decl.clone({ value: value }))
      }
    })

    if (opts.mediaQuery) {
      css.walkAtRules('media', function (rule) {
        if (rule.params.indexOf('rem') === -1) return
        rule.params = rule.params.replace(pxRegex, pxReplace)
      })
    }
  }
})


function createPxReplace (remtorpxBase, unitPrecision, minPixelValue, onePxTransform) {
  return function (m, $1) {
    console.error(m, $1)
    if (!$1) return m
    if (!onePxTransform && parseInt($1, 10) === 1) {
      return m
    }
    const rems = parseFloat($1)

    if (rems < minPixelValue) return m
    const fixedVal = toFixed((rems * remtorpxBase), unitPrecision)
    console.error('===fixedVal===')
    console.error(fixedVal)
    return (fixedVal === 0) ? '0' : fixedVal + targetUnit
  }
}

function toFixed (number, precision) {
  const multiplier = Math.pow(10, precision + 1)
  const wholeNumber = Math.floor(number * multiplier)
  return Math.round(wholeNumber / 10) * 10 / multiplier
}

function declarationExists (decls, prop, value) {
  return decls.some(function (decl) {
    return (decl.prop === prop && decl.value === value)
  })
}

function blacklistedSelector (blacklist, selector) {
  if (typeof selector !== 'string') return
  return blacklist.some(function (regex) {
    if (typeof regex === 'string') return selector.indexOf(regex) !== -1
    return selector.match(regex)
  })
}

function createPropListMatcher (propList) {
  const hasWild = propList.indexOf('*') > -1
  const matchAll = (hasWild && propList.length === 1)
  const lists = {
    exact: filterPropList.exact(propList),
    contain: filterPropList.contain(propList),
    startWith: filterPropList.startWith(propList),
    endWith: filterPropList.endWith(propList),
    notExact: filterPropList.notExact(propList),
    notContain: filterPropList.notContain(propList),
    notStartWith: filterPropList.notStartWith(propList),
    notEndWith: filterPropList.notEndWith(propList)
  }
  return function (prop) {
    if (matchAll) return true
    return (
      (
        hasWild ||
        lists.exact.indexOf(prop) > -1 ||
        lists.contain.some(function (m) {
          return prop.indexOf(m) > -1
        }) ||
        lists.startWith.some(function (m) {
          return prop.indexOf(m) === 0
        }) ||
        lists.endWith.some(function (m) {
          return prop.indexOf(m) === prop.length - m.length
        })
      ) &&
      !(
        lists.notExact.indexOf(prop) > -1 ||
        lists.notContain.some(function (m) {
          return prop.indexOf(m) > -1
        }) ||
        lists.notStartWith.some(function (m) {
          return prop.indexOf(m) === 0
        }) ||
        lists.notEndWith.some(function (m) {
          return prop.indexOf(m) === prop.length - m.length
        })
      )
    )
  }
}

import { expect, test, describe } from 'vite-plus/test'

import { parse, bind, LangError, ParseError, assertAtom } from '../src/index.ts'
import type { Form } from '../src/index.ts'

/**
 * 这组测试证明核心与语义无关：同一份核心，配三套完全不同的词表。
 * 全程纯解释，没有任何 eval / new Function。
 */

/* ---------------- 词表 A：算术 + 变量（Out = number） ---------------- */

function makeArith() {
  type Ctx = Map<string, number>
  return bind<Ctx, number>((run, ctx) => ({
    '+'(...args) {
      return args.reduce((s, a) => s + run(a), 0)
    },
    '*'(...args) {
      return args.reduce((s, a) => s * run(a), 1)
    },
    def(name, value) {
      assertAtom(name, 'a $name')
      if (!value) throw new Error('def is missing a value')
      ctx.set(name.text, run(value))
      return 0 // def yields nothing useful; 0 is a placeholder
    },
    // 原子由 num / var 显式求值：裸原子本身不能求值
    num(a) {
      assertAtom(a, 'a number')
      return Number(a.text)
    },
    var(name) {
      assertAtom(name, 'a $variable')
      const v = ctx.get(name.text)
      if (v === undefined) throw new LangError(`undefined variable ${name.text}`, name.loc)
      return v
    }
  }))
}

describe('table A: arithmetic + variables', () => {
  test('nested evaluation', () => {
    const a = makeArith()
    expect(a('(+ (num 1) (+ (num 2) (num 3)))', new Map())).toEqual([6])
  })

  test('def and references', () => {
    const a = makeArith()
    const out = a('(def $x (num 10)) (+ (var $x) (num 5))', new Map())
    expect(out[1]).toBe(15)
  })

  test('undefined variable carries a location', () => {
    const a = makeArith()
    try {
      a('(+ (var $nope) (num 1))', new Map())
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LangError)
      expect((e as LangError).message).toContain('$nope')
      expect((e as LangError).loc.line).toBe(1)
    }
  })

  test('one bind works with many ctx', () => {
    const a = makeArith()
    expect(a('(def $x (num 1)) (var $x)', new Map())).toEqual([0, 1])
    // 新 ctx 里 $x 不存在
    expect(() => a('(var $x)', new Map())).toThrow(/\$x/)
  })
})

/* ---------------- 词表 B：生成字符串（Out = string） ---------------- */

describe('table B: HTML generation', () => {
  const html = bind<null, string>((run) => ({
    tag(name, ...children) {
      assertAtom(name, 'a tag name')
      return `<${name.text}>${children.map((c) => run(c)).join('')}</${name.text}>`
    },
    text(s) {
      if (s?.kind !== 'string') throw new Error('text expects a string')
      return s.value
    }
  }))

  test('nested', () => {
    expect(html('(tag div (tag span (text "hi")))', null)).toEqual(['<div><span>hi</span></div>'])
  })

  test('same source, different table, different language', () => {
    const count = bind<null, number>(() => ({
      tag() {
        return 1
      },
      text() {
        return 1
      }
    }))
    const src = '(tag div (text "x"))'
    expect(html(src, null)).toEqual(['<div>x</div>'])
    expect(count(src, null)).toEqual([1])
  })
})

/* ---------------- 词表 C：栈机（Out = void） ---------------- */

describe('table C: stack machine (side effects)', () => {
  const stack = bind<number[], void>((run, ctx) => ({
    push(a) {
      assertAtom(a, 'a number')
      ctx.push(Number(a.text))
    },
    '+'() {
      const b = ctx.pop()!
      const a = ctx.pop()!
      ctx.push(a + b)
    },
    '*'() {
      const b = ctx.pop()!
      const a = ctx.pop()!
      ctx.push(a * b)
    },
    seq(...args) {
      for (const a of args) run(a)
    }
  }))

  test('evaluates in order', () => {
    const ctx: number[] = []
    stack('(push 1) (push 2) (+) (push 3) (*)', ctx)
    expect(ctx).toEqual([9])
  })
})

/* ---------------- 模板字面量 ---------------- */

describe('template literals', () => {
  const count = bind<null, number>(() => ({
    n(a) {
      assertAtom(a, 'a number')
      return Number(a.text)
    },
    '(...)'() {
      return 0
    }
  }))

  test('template returns a function taking ctx', () => {
    const t = count`(n 1)`
    expect(t(null)).toEqual([1])
  })
})

/* ---------------- 已解析的树 ---------------- */

describe('passing a parsed tree', () => {
  test('skips parse', () => {
    const count = bind<null, number>(() => ({
      n(a) {
        assertAtom(a, 'a number')
        return Number(a.text)
      }
    }))
    const forms = parse('(n 1) (n 2)')
    expect(count(forms, null)).toEqual([1, 2])
  })
})

/* ---------------- 错误 ---------------- */

describe('errors', () => {
  test('parse errors throw ParseError with a location', () => {
    expect(() => count('(a', null)).toThrow(/unterminated/)
    try {
      count('(a\n', null)
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      expect((e as ParseError).loc.line).toBe(1)
    }
  })

  const count = bind<null, number>(() => ({
    n(a) {
      assertAtom(a, 'a number')
      return Number(a.text)
    }
  }))

  test('a bare atom cannot be evaluated', () => {
    expect(() => count('123', null)).toThrow(/cannot be evaluated on its own/)
  })

  test('unknown word suggests similar words', () => {
    expect(() => count('(nn 1)', null)).toThrow(/unknown word nn/)
  })

  test('plain Errors from handlers get the head location', () => {
    const table = bind<null, number>(() => ({
      boom() {
        throw new Error('boom')
      }
    }))
    try {
      table('(boom)', null)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LangError)
      expect((e as LangError).loc.line).toBe(1)
      expect((e as LangError).loc.col).toBe(2)
    }
  })

  test('missing arguments are undefined, not a crash', () => {
    const table = bind<null, string>(() => ({
      need(...args: (Form | undefined)[]) {
        return args.length === 0 ? 'none' : `got undefined: ${args[0] === undefined}`
      }
    }))
    expect(table('(need)', null)).toEqual(['none'])
  })
})

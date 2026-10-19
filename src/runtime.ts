import { LocError } from './errors.ts'
import type { Form, Loc } from './form.ts'
import { parse } from './parse.ts'

/**
 * 表驱动的求值核心。
 *
 * 它不认识任何具体的词，也没有 `env`、没有 `eval`。
 * 每个方法收到的是【原始 Form】，想求值子节点就调闭包里的 `run`。
 *
 * 没有生成源码、没有 eval、没有 new Function —— 纯解释器。
 */

/** 运行时错误。总是带源位置。 */
export class LangError extends LocError {
  constructor(message: string, loc: Loc) {
    super(message, loc)
    this.name = 'LangError'
  }
}

/**
 * 一个词的处理函数。参数是【原始 Form】，不预先求值。
 *
 * 参数个数不限：声明几个就收几个，多余的丢掉，少的为 undefined。
 * 返回值由词表的作者约定（整张表共享一个 `Out`）。
 */
export type Handler<Out> = (...args: readonly Form[]) => Out

/** 词表：词 → 处理函数。普通对象即可。 */
export type Table<Out> = Record<string, Handler<Out>>

/** 递归求值一个子节点。由 `bind` 提供，通过闭包到达处理函数。 */
export type Recursor<Out> = (form: Form) => Out

/**
 * 造表函数。
 *
 * 每个 ctx 造一张表 —— 这样 ctx 走闭包，不需要参数传递。
 * `run` 是供处理函数递归用的入口。
 */
export type TableFactory<Ctx, Out> = (run: Recursor<Out>, ctx: Ctx) => Table<Out>

/**
 * `bind` 的返回值。三种调用形式：
 *
 * ```
 * a("(push 1)", ctx)          // 源文本
 * a(forms, ctx)               // 已解析的树（可缓存 / 程序化生成）
 * a`(push 1)`(ctx)            // 模板字面量 → 返回一个接受 ctx 的函数
 * ```
 */
export interface Bound<Ctx, Out> {
  (source: string, ctx: Ctx): Out[]
  (forms: readonly Form[], ctx: Ctx): Out[]
  (strings: TemplateStringsArray): (ctx: Ctx) => Out[]
}

const isTemplateArray = (x: unknown): x is TemplateStringsArray =>
  Array.isArray(x) && Object.hasOwn(x, 'raw')

/**
 * 直接抛运行时错误。
 *
 * 显式的函数类型标注不能省：TypeScript 只对**有显式类型声明的标识符**
 * 应用 `never` 返回值的类型收窄。写成推断的箭头函数会导致调用点
 * 拿不到收窄。
 */
const fail: (message: string, loc: Loc) => never = (message, loc) => {
  throw new LangError(message, loc)
}

const evaluate = <Out>(form: Form, table: Table<Out>): Out => {
  if (form.kind !== 'list') {
    const what = form.kind === 'atom' ? `atom ${form.text}` : 'a string'
    fail(`${what} cannot be evaluated on its own; it must be an argument`, form.loc)
  }

  const [head, ...args] = form.items
  if (!head) fail('empty list () cannot be evaluated', form.loc)
  if (head.kind !== 'atom') fail('the first element of a list must be a word (atom)', head.loc)

  const handler = table[head.text]
  if (typeof handler !== 'function') {
    fail(unknownWordMessage(head.text, table), head.loc)
  }

  try {
    return handler(...args)
  } catch (e) {
    if (e instanceof LangError || !(e instanceof Error)) throw e
    // 方法忘了带位置：补上头词的位置
    fail(e.message, head.loc)
  }
}

/** 词根：`w.add` → `add`。 */
const wordTail = (name: string): string => name.split('.').at(-1) ?? name

const isSimilar = (a: string, b: string): boolean =>
  a.startsWith(b) || b.startsWith(a) || wordTail(a) === wordTail(b)

const unknownWordMessage = <Out>(name: string, table: Table<Out>): string => {
  const near = Object.keys(table)
    .filter((n) => n !== name && isSimilar(n, name))
    .sort()
    .slice(0, 5)
  return near.length > 0
    ? `unknown word ${name}; did you mean: ${near.join(', ')}`
    : `unknown word ${name}`
}

/**
 * 绑定一张表，返回可以重复使用的入口。
 *
 * `run` 和 `table` 互相依赖（方法要能递归），用惰性赋值打破循环：
 * 造表期间调用 `run` 会拿到尚未赋值的 `table`，因此会抛错。
 * 这是刻意的——造表时递归求值没有意义。
 */
export const bind = <Ctx, Out>(factory: TableFactory<Ctx, Out>): Bound<Ctx, Out> => {
  const cache = new Map<string, readonly Form[]>()

  /** 造一个绑定到 ctx 的 run。table 与 run 互相依赖，用惰性赋值打破循环。 */
  const runWith = (ctx: Ctx): Recursor<Out> => {
    let table: Table<Out>
    const run: Recursor<Out> = (form) => evaluate(form, table)
    table = factory(run, ctx)
    return run
  }

  const toForms = (source: string): readonly Form[] => {
    const hit = cache.get(source)
    if (hit) return hit
    const forms = parse(source)
    cache.set(source, forms)
    return forms
  }

  /** 唯一的执行入口：造 run，然后把每棵树跑一遍。 */
  const execute = (forms: readonly Form[], ctx: Ctx): Out[] => forms.map(runWith(ctx))

  return ((first: string | readonly Form[] | TemplateStringsArray, ctx?: Ctx) => {
    if (isTemplateArray(first)) {
      const forms = toForms(first.raw.join(''))
      return (c: Ctx) => execute(forms, c)
    }
    return execute(typeof first === 'string' ? toForms(first) : first, ctx as Ctx)
  }) as Bound<Ctx, Out>
}

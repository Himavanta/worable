/**
 * worable —— 表驱动的 S 表达式解释器核心。
 *
 * 只提供解析与求值，不含任何内置语义：语言里的每个词都由调用方的词表提供，
 * 所以同一份核心可以承载任意 S 表达式语言。
 *
 * 纯解释器：没有 `env`、没有 `eval`、没有 `new Function`、不生成源码。
 * 处理函数收到的是【原始 Form】，需要递归求值时调用闭包里的 `run`。
 */

export type { Form, ListForm, AtomForm, StringForm, Loc } from './form.ts'
export { LocError } from './errors.ts'
export { parse, ParseError } from './parse.ts'
export type { Handler, Table, Recursor, TableFactory, Bound } from './runtime.ts'
export { LangError, bind } from './runtime.ts'

import type { Form, AtomForm, StringForm, ListForm } from './form.ts'

/** 三个断言共用的检查。 */
const need = (form: Form | undefined, kind: Form['kind'], what: string): void => {
  if (!form) throw new Error(`missing ${what}`)
  if (form.kind !== kind) throw new Error(`expected ${what}`)
}

/*
 * 这三个保留 function 声明，不用箭头：
 * `asserts` 签名在箭头函数上要求「显式写出完整类型」，比函数声明还长。
 */

export function assertAtom(form: Form | undefined, what: string): asserts form is AtomForm {
  need(form, 'atom', what)
}

export function assertString(form: Form | undefined, what: string): asserts form is StringForm {
  need(form, 'string', what)
}

export function assertList(form: Form | undefined, what: string): asserts form is ListForm {
  need(form, 'list', what)
}

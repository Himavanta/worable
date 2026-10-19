import type { Loc } from './form.ts'

/**
 * 带源位置的错误基类。
 *
 * 解析错误和运行时错误都带 `loc`，共享这个构造。
 */
export class LocError extends Error {
  readonly loc: Loc
  constructor(message: string, loc: Loc) {
    super(message)
    this.loc = loc
  }
}

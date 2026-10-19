/**
 * S 表达式的数据模型。
 *
 * 只有三种形态：列表、原子、字符串。没有第四种。
 */

/** 源位置。行、列从 1 开始。 */
export interface Loc {
  readonly line: number
  readonly col: number
}

export type Form = ListForm | AtomForm | StringForm

/** `(a b c)`；`()` 的 items 为空。 */
export interface ListForm {
  readonly kind: 'list'
  readonly items: readonly Form[]
  readonly loc: Loc
}

/** 裸词：`add`、`$name`、`@label`、`123`。词法上不做任何解释。 */
export interface AtomForm {
  readonly kind: 'atom'
  readonly text: string
  readonly loc: Loc
}

/** `"hello"`；value 是解转义后的内容。 */
export interface StringForm {
  readonly kind: 'string'
  readonly value: string
  readonly loc: Loc
}

import { LocError } from './errors.ts'
import type { Form, Loc } from './form.ts'

/**
 * 词法 + 语法：把源文本读成一棵 Form 树。
 *
 * 语法只有四条：
 *   1. `(` ... `)` 是列表
 *   2. 不含空白、也不含 `(` `)` `"` `#` `\` 的连续字符是原子
 *   3. `"` ... `"` 是字符串；`\` 是分隔符，所以原子内部不可能出现反斜杠
 *   4. `#` 到行尾是注释
 *
 * 出错时直接抛 ParseError（有位置）。没有"返回错误"的第二条路径。
 */

/** 解析错误。 */
export class ParseError extends LocError {
  constructor(message: string, loc: Loc) {
    super(message, loc)
    this.name = 'ParseError'
  }
}

const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r'

const isDelimiter = (c: string): boolean =>
  c === '(' || c === ')' || c === '"' || c === '#' || c === '\\'

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
  '\\': '\\',
  '"': '"'
}

export const parse = (source: string): Form[] => {
  let offset = 0
  let line = 1
  let col = 1

  const here = (): Loc => ({ line, col })

  /**
   * 直接抛解析错误。
   *
   * 显式的函数类型标注不能省：TypeScript 只对**有显式类型声明的标识符**
   * 应用 `never` 返回值的类型收窄。写成推断的箭头函数会导致调用点
   * 拿不到收窄。
   */
  const fail: (message: string, loc: Loc) => never = (message, loc) => {
    throw new ParseError(message, loc)
  }

  /** 前进一个字符，维护行列。 */
  const bump = (): string => {
    const c = source[offset]!
    offset++
    if (c === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
    return c
  }

  const peek = (): string | undefined => source[offset]
  const eof = (): boolean => offset >= source.length

  const skipLine = (): void => {
    while (!eof() && peek() !== '\n') bump()
  }

  const skipSpaceAndComments = (): void => {
    while (!eof()) {
      const c = peek()!
      if (isSpace(c)) bump()
      else if (c === '#') skipLine()
      else return
    }
  }

  /** 读一个转义序列；调用时 `\\` 已被消费。 */
  const readEscape = (): string => {
    if (eof()) fail('escape at end of line', here())
    const e = bump()
    const mapped = ESCAPES[e]
    if (mapped === undefined) fail(`unknown escape \\${e}`, here())
    return mapped
  }

  const readString = (start: Loc): Form => {
    bump() // opening quote
    let value = ''
    while (true) {
      if (eof()) fail('unterminated string', start)
      const c = bump()
      if (c === '"') return { kind: 'string', value, loc: start }
      value += c === '\\' ? readEscape() : c
    }
  }

  const readAtom = (start: Loc): Form => {
    let text = ''
    while (!eof() && !isSpace(peek()!) && !isDelimiter(peek()!)) text += bump()
    if (text === '') fail(`unexpected character ${JSON.stringify(peek())}`, start)
    return { kind: 'atom', text, loc: start }
  }

  /** 读到 `)` 为止；调用时 `(` 已被消费，且已跳过空白。 */
  const readList = (start: Loc): Form => {
    const items: Form[] = []
    while (true) {
      skipSpaceAndComments()
      if (eof()) fail('unterminated list', start)
      if (peek() === ')') {
        bump()
        return { kind: 'list', items, loc: start }
      }
      items.push(readForm())
    }
  }

  /** 调用前必须已跳过空白。 */
  const readForm = (): Form => {
    const start = here()
    const c = peek()!
    if (c === '(') {
      bump()
      return readList(start)
    }
    if (c === ')') fail('unmatched )', start)
    if (c === '"') return readString(start)
    return readAtom(start)
  }

  const forms: Form[] = []
  skipSpaceAndComments()
  while (!eof()) {
    forms.push(readForm())
    skipSpaceAndComments()
  }
  return forms
}

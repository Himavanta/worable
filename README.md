# worable

A table-driven S-expression interpreter core — parsing and evaluation only, with no built-in words.

一个表驱动的 S 表达式解释器核心——只提供解析与求值，不含任何内置词。

## Why / 为什么

Most S-expression libraries interpret by generating JavaScript and running it. That path is closed on mini-programs and on iOS, where executing downloaded code is not allowed. worable is a pure interpreter: every evaluation is a table lookup plus a function call, so the same code runs on servers, browsers, and any sandbox that forbids dynamic code.

The second reason is separation. A language is usually two things tangled together: the syntax, and the meaning of each word. worable owns the first and refuses the second, so adding a word never touches the parser.

多数 S 表达式库的做法是「生成 JavaScript 再执行」。这条路在小程序和 iOS 上是关闭的——它们不允许执行下发的代码。worable 是纯解释器：每次求值都是一次查表加一次函数调用，因此同一份代码可以跑在服务端、浏览器，以及任何禁止动态代码的沙箱里。

第二个理由是分离。一门语言通常是两样东西缠在一起：语法，和每个词的含义。worable 只拥有前者，拒绝后者，所以加一个词永远不需要改 parser。

## What a Table Can Be / 词表能做什么

The table decides what evaluation _means_, and `Out` is whatever your handlers return. With `Out = number` you get a calculator; with `Out = void` and a mutable `ctx` you get an imperative machine; with `Out = string` you get a **transpiler**. Words like `fn`, `ret`, `call` can assemble any text you want — JavaScript, JSON, SQL, a config file, a QBE module — and the core never needs to know.

That last shape deserves emphasis. This library does not call `eval` and cannot, but it can absolutely _produce_ the string you would eval. Emitting JS from S-expressions is a word table returning strings; whether you then `eval` the result is your decision and your responsibility, not a capability the core lacks.

词表决定「求值」意味着什么，`Out` 就是你处理函数返回的东西。`Out = number` 是一台计算器；`Out = void` 配一个可变的 `ctx` 是一台命令式机器；`Out = string` 则是一台**转译器**。`fn`、`ret`、`call` 这类词可以拼出任何你想要的文本——JavaScript、JSON、SQL、配置文件、QBE 模块——核心完全不需要知道这些。

最后一种形态值得强调。本库不调用 `eval`，也不能调用；但它完全可以**产出**你会拿去 eval 的那个字符串。从 S 表达式生成 JS，就是一张返回字符串的词表；至于拿到结果之后是否 eval，那是你的决定和责任，不是核心缺少的能力。

```ts
// Out = string: same core, a word table that emits JavaScript
const js = bind<null, string>((run) => ({
  fn(name, ...body) {
    assertAtom(name, 'a $name')
    return `function ${name.text.slice(1)}(){${body.map((b) => run(b)).join('')}}`
  },
  ret(value) {
    return `return ${run(value)};`
  },
  '+'(...args) {
    return args.map((a) => run(a)).join('+')
  },
  n(a) {
    assertAtom(a, 'a number')
    return a.text
  }
}))

js('(fn $add (ret (+ (n 1) (n 2))))', null)
// => ['function add(){return 1+2;}']
```

## Quick Start / 快速开始

Install the package, then describe your language with `bind`. The factory receives a recursor `run` and your own context `ctx`, and returns an object mapping each word to a handler. Handlers receive the **raw** argument forms, not evaluated values — you decide which ones to evaluate, and in what order.

`bind` returns a function with three call shapes. All three use the same table and differ only in how the source arrives: as source text (parsed and cached), as an already-parsed tree, or as a tagged template literal. The template form returns a function because a tagged template cannot take the context argument itself.

先安装，再用 `bind` 描述你的语言。工厂函数收到递归入口 `run` 和你自己的上下文 `ctx`，返回一个「词 → 处理函数」的对象。处理函数收到的是**原始**参数节点，不是求值结果——是否求值、求值哪一个、按什么顺序，都由你决定。

`bind` 返回的函数有三种调用形式。三者用的是同一张词表，差别只在源文本怎么进来：源文本（会解析并缓存）、已解析的树、模板字面量。模板形式返回一个函数，是因为标签模板本身没法再收上下文参数。

```bash
npm install worable
```

An environment with variables and arithmetic — `Out` is a number, `ctx` is a `Map`:

一个带变量和算术的环境——`Out` 是数字，`ctx` 是一个 `Map`：

```ts
import { bind, assertAtom, LangError } from 'worable'

type Vars = Map<string, number>

const calc = bind<Vars, number>((run, vars) => ({
  num(a) {
    assertAtom(a, 'a number')
    return Number(a.text)
  },
  var(name) {
    assertAtom(name, 'a $name')
    const value = vars.get(name.text)
    if (value === undefined) throw new LangError(`undefined variable ${name.text}`, name.loc)
    return value
  },
  def(name, value) {
    assertAtom(name, 'a $name')
    if (!value) throw new Error('def needs a value')
    const result = run(value)
    vars.set(name.text, result)
    return result
  },
  '+'(...args) {
    return args.reduce((sum, a) => sum + run(a), 0)
  },
  '*'(...args) {
    return args.reduce((acc, a) => acc * run(a), 1)
  }
}))

const vars: Vars = new Map()

calc('(def $x (num 2)) (* (var $x) (+ (num 1) (num 2)))', vars) // => [2, 6]
calc(parse('(num 1)'), vars) // => [1] — already-parsed tree / 已解析的树
calc`(num 1)`(vars) // => [1] — template literal / 模板字面量
```

## Syntax / 语法

Parsing is small and total, with exactly four rules. Parentheses delimit lists, and `()` is a list with no items. An atom is any run of characters that is neither whitespace nor one of `(`, `)`, `"`, `#`, `\`. A string is `"` … `"`, with the escapes `\n`, `\t`, `\r`, `\0`, `\\`, `\"` decoded; any other escape is an error. A `#` runs to the end of the line and is a comment.

Atoms carry no lexical meaning. `add`, `$name`, `@label`, `123`, and `w.add` are all the same kind of token; a handler that wants a number or a variable name decides that for itself. Because `\` is a delimiter, an atom cannot contain a backslash — writing `a\b` outside a string is an error, not an escape.

Every node carries its source location in `loc`, whose `line` and `col` are 1-based and point at the node's first character:

解析小而完整，总共只有四条规则。括号界定列表，`()` 是空列表。原子是不含空白、也不含 `(`, `)`, `"`, `#`, `\` 的连续字符。字符串是 `"` … `"`，支持转义 `\n`、`\t`、`\r`、`\0`、`\\`、`\"`，其它转义是错误。`#` 到行尾是注释。

原子在词法上没有任何含义。`add`、`$name`、`@label`、`123`、`w.add` 都是同一种记号；想知道它是不是数字或变量名，由处理函数自己判断。由于 `\` 是分隔符，原子内部不能出现反斜杠——在字符串之外写 `a\b` 是错误，而不是转义。

每个节点都带源位置 `loc`，其 `line` 和 `col` 从 1 开始，指向该节点的首字符：

```ts
import { parse } from 'worable'

parse('(w.add $a (l.const 1))')
// [{ kind: 'list', items: [...], loc: { line: 1, col: 1 } }]
```

## API / 接口

`parse(source)` reads source text into top-level forms and throws `ParseError` on any lexical or structural problem — there is no second, non-throwing path.

`bind(factory)` binds a table and returns the entry point. Inside a handler, `run` is the only way to evaluate a child node, and it arrives through the closure rather than as an argument.

The entry point returns an array with one entry per top-level form. `LocError` is the base class, with `ParseError` and `LangError` extending it; all three expose `loc`. A handler may throw freely: throw `LangError` to attach a precise location, and any other `Error` is caught by the evaluator and re-thrown as a `LangError` pointing at the head word of the offending list.

`assertAtom`, `assertString`, and `assertList` narrow a `Form` to one of its three kinds. They throw a plain `Error` on mismatch, which the evaluator converts to a `LangError` carrying the head-word location.

`parse(source)` 把源文本读成若干顶层节点，任何词法或结构问题都抛 `ParseError`——没有第二条不抛错的路径。

`bind(factory)` 绑定一张词表并返回入口函数。在处理函数内部，`run` 是求值子节点的唯一途径，它通过闭包到达，而不是作为参数传入。

入口函数返回数组，每个顶层节点一项。`LocError` 是基类，`ParseError` 和 `LangError` 继承它，三者都暴露 `loc`。处理函数可以随意抛错：抛 `LangError` 可以指定精确位置，其它 `Error` 会被求值器捕获，重新包成 `LangError`，位置指向出问题那个列表的头词。

`assertAtom`、`assertString`、`assertList` 把 `Form` 收窄到三种形态之一。不匹配时抛普通 `Error`，求值器会把它转成带「头词位置」的 `LangError`。

```ts
function parse(source: string): Form[]

function bind<Ctx, Out>(factory: TableFactory<Ctx, Out>): Bound<Ctx, Out>

type TableFactory<Ctx, Out> = (run: Recursor<Out>, ctx: Ctx) => Table<Out>
type Table<Out> = Record<string, Handler<Out>>
type Handler<Out> = (...args: readonly Form[]) => Out
type Recursor<Out> = (form: Form) => Out

interface Bound<Ctx, Out> {
  (source: string, ctx: Ctx): Out[]
  (forms: readonly Form[], ctx: Ctx): Out[]
  (strings: TemplateStringsArray): (ctx: Ctx) => Out[]
}

function assertAtom(form: Form | undefined, what: string): asserts form is AtomForm
function assertString(form: Form | undefined, what: string): asserts form is StringForm
function assertList(form: Form | undefined, what: string): asserts form is ListForm
```

## Behaviour / 行为

**Only lists evaluate.** A bare atom or a string is data; `123` and `$x` cannot be evaluated on their own, and reading a variable is an explicit word. This is deliberate — evaluation needs a head word, otherwise a typo has nowhere to be reported. For the same reason the head of a list must be an atom: `((a) 1)` is an error, not a computed function position.

**Arity is not checked.** Declare as many handler parameters as you like; extra arguments are dropped and missing ones are `undefined`.

**The table is rebuilt per call.** Every invocation of the bound function calls the factory once, and that one table serves all top-level forms in the call. Handler closures therefore persist across forms within a call but not across calls, so state that must survive a call belongs in `ctx`.

**只有列表才求值。** 裸原子和字符串是数据；`123` 和 `$x` 不能单独求值，读取变量是一个显式的词。这是刻意的——求值需要头词，否则拼错无处可报。同理，列表的头必须是原子：`((a) 1)` 是错误，不存在「计算出来的函数位置」。

**不检查参数个数。** 处理函数声明几个参数就收几个，多余的丢掉，缺的为 `undefined`。

**表是每次调用重建的。** 绑定函数的每一次调用都会调一次工厂，这张表服务于该次调用的所有顶层节点。因此处理函数闭包里的状态在同一次调用的多个顶层节点之间保留，但跨调用不保留——需要跨调用持续的状态应当放进 `ctx`。

## Caching and Errors / 缓存与报错

The template form ignores interpolations: it parses `strings.raw` only, so `` t`(n ${v})` `` does not substitute `v`. Build the source string first if you need interpolation.

Parsed source is cached by text, and the cache never evicts, so repeated calls with the same source string skip parsing while a program that mangles unique source strings should pass pre-parsed trees instead.

Unknown words are diagnosed rather than guessed: the error lists up to five similar names, matched by shared prefix or by shared root after the last `.`.

模板形式不处理插值：它只解析 `strings.raw`，所以 `` t`(n ${v})` `` 不会把 `v` 代进去。需要插值就先自己拼好源字符串。

解析结果按源文本缓存，且缓存不会淘汰，所以相同源文本的重复调用会跳过解析；反之，若程序会拼出大量不重复的源文本，应改为传入已解析的树。

未知词只做诊断，不做猜测：报错会列出最多五个相近的名字，判据是前缀相同，或最后一个 `.` 之后的部分相同。

## Design / 设计取舍

There is no environment object. The context is a plain value captured by the factory's closure, so a handler never receives an `env` it must understand. There is no evaluator argument either: `run` is captured the same way.

The core generates no code. Producing text is a table's job, not the evaluator's, so evaluation stays a table lookup and stack traces stay honest. What a program does with the text it gets back is its own business.

The trade-off is explicit: because evaluation needs a head word, the language cannot express postfix stacking `(1 2 +)`, and a syntax error can only be reported where a word exists. Both are accepted costs, not oversights.

没有环境对象。上下文是工厂函数闭包捕获的普通值，处理函数永远不需要理解一个叫 `env` 的东西。求值入口同理，`run` 也是闭包捕获的。

核心本身不生成代码。产出文本是词表的事，不是求值器的事，所以求值始终只是一次查表，调用栈也保持诚实。程序拿到文本之后怎么用，与核心无关。

代价是明确的：因为求值需要头词，这门语言表达不了后缀式堆叠 `(1 2 +)`；语法错误的定位也只在「有词可报」的地方成立。这两点是被接受的成本，不是疏忽。

## License / 许可

MIT

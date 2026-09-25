// Tiny boolean expression language used to wire mechanisms to signals.
// Grammar:  expr := term ('|' term)* ; term := factor ('&' factor)* ;
//           factor := '!' factor | '(' expr ')' | ident | 'true' | 'false'

export type Signals = Record<string, boolean>;
export type CompiledExpr = (s: Signals) => boolean;

export interface ExprInfo {
  eval: CompiledExpr;
  /** Signal ids referenced by the expression (used for validation and rendering wires). */
  refs: string[];
}

export function compileExpr(src: string | undefined): ExprInfo {
  if (src === undefined || src.trim() === '') return { eval: () => true, refs: [] };
  const tokens = src.match(/[A-Za-z0-9_]+|[&|!()]/g) ?? [];
  const refs: string[] = [];
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expr(): CompiledExpr {
    let left = term();
    while (peek() === '|') {
      next();
      const a = left;
      const b = term();
      left = (s) => a(s) || b(s);
    }
    return left;
  }
  function term(): CompiledExpr {
    let left = factor();
    while (peek() === '&') {
      next();
      const a = left;
      const b = factor();
      left = (s) => a(s) && b(s);
    }
    return left;
  }
  function factor(): CompiledExpr {
    const t = next();
    if (t === undefined) throw new Error(`Unexpected end of expression "${src}"`);
    if (t === '!') {
      const f = factor();
      return (s) => !f(s);
    }
    if (t === '(') {
      const e = expr();
      if (next() !== ')') throw new Error(`Missing ")" in "${src}"`);
      return e;
    }
    if (t === 'true') return () => true;
    if (t === 'false') return () => false;
    if (!/^[A-Za-z0-9_]+$/.test(t)) throw new Error(`Unexpected token "${t}" in "${src}"`);
    refs.push(t);
    return (s) => s[t] === true;
  }

  const fn = expr();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in "${src}"`);
  return { eval: fn, refs };
}

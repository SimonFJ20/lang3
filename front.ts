import { BinaryOp, Block, Expr, ExprKind, Stmt, StmtKind } from "./ast.ts";
import { Ty, tyToString } from "./ty.ts";

export class Checker {
    private stmtTys = new Map<number, Ty>();
    private exprTys = new Map<number, Ty>();

    public errorOccured = false;

    public constructor(
        private re: Resols,
    ) {}

    public fnStmtTy(stmt: Stmt): Ty {
        const k = stmt.kind;
        if (k.tag !== "fn") {
            throw new Error();
        }
        if (this.stmtTys.has(stmt.id)) {
            return this.stmtTys.get(stmt.id)!;
        }
        const params = k.params.map((_): Ty => ({ tag: "int" }));
        const returnTy: Ty = { tag: "int" };
        const ty: Ty = { tag: "fn", stmt, params, returnTy };
        this.stmtTys.set(stmt.id, ty);
        return ty;
    }

    public paramTy(stmt: Stmt, i: number): Ty {
        const ty = this.fnStmtTy(stmt);
        if (ty.tag !== "fn") {
            throw new Error();
        }
        return ty.params[i];
    }

    public letStmtTy(stmt: Stmt): Ty {
        const k = stmt.kind;
        if (k.tag !== "let") {
            throw new Error();
        }
        if (this.stmtTys.has(stmt.id)) {
            return this.stmtTys.get(stmt.id)!;
        }
        const ty = this.exprTy(k.expr);
        this.stmtTys.set(stmt.id, ty);
        return ty;
    }

    public exprTy(expr: Expr): Ty {
        if (this.exprTys.has(expr.id)) {
            return this.exprTys.get(expr.id)!;
        }
        const ty = ((): Ty => {
            const k = expr.kind;
            switch (k.tag) {
                case "error":
                    return { tag: "error" };
                case "ident": {
                    const res = this.re.expr(expr);
                    if (!res) {
                        throw new Error();
                    }
                    switch (res.tag) {
                        case "fn":
                            return this.fnStmtTy(res.stmt);
                        case "param":
                            return this.paramTy(res.stmt, res.i);
                        case "let":
                            return this.letStmtTy(res.stmt);
                        case "loop":
                            throw new Error();
                    }
                    throw new Error();
                }
                case "int":
                    return { tag: "int" };
                case "call": {
                    const callee = this.exprTy(k.expr);
                    if (callee.tag !== "fn") {
                        this.report("call to non-function", expr.line);
                        return { tag: "error" };
                    }
                    if (callee.params.length !== k.args.length) {
                        this.report(
                            `argument mismatch, expected ${callee.params.length}, got ${k.args.length}`,
                            expr.line,
                        );
                        return { tag: "error" };
                    }
                    const args = k.args.map((arg) => this.exprTy(arg));
                    for (const [i, param] of callee.params.entries()) {
                        if (!this.assignable(args[i], param)) {
                            this.report(
                                `argument mismatch, type '${
                                    tyToString(args[i])
                                }' not assignable to '${tyToString(param)}'`,
                                expr.line,
                            );
                        }
                    }
                    return callee.returnTy;
                }
                case "binary": {
                    const left = this.exprTy(k.left);
                    const right = this.exprTy(k.right);

                    const cfg = (op: BinaryOp, l: Ty, r: Ty = l) =>
                        k.op === op && this.assignable(left, l) &&
                        this.assignable(right, r);

                    if (cfg("<", { tag: "int" })) {
                        return { tag: "int" };
                    }
                    if (cfg("==", { tag: "int" })) {
                        return { tag: "int" };
                    }
                    if (cfg("+", { tag: "int" })) {
                        return { tag: "int" };
                    }
                    if (cfg("*", { tag: "int" })) {
                        return { tag: "int" };
                    }

                    this.report(
                        `cannot '${k.op}' type '${tyToString(left)}' with '${
                            tyToString(right)
                        }'`,
                        expr.line,
                    );
                    return { tag: "error" };
                }
            }
            const _: never = k;
        })();
        this.exprTys.set(expr.id, ty);
        return ty;
    }

    private assignable(a: Ty, b: Ty): boolean {
        if (a.tag !== b.tag) {
            return false;
        }
        if (a.tag === "fn" && b.tag === "fn" && a.stmt.id !== b.stmt.id) {
            return false;
        }
        return true;
    }

    private report(msg: string, line: number) {
        this.errorOccured = true;
        //console.error(`parser: ${msg} on line ${line}`);
        throw new Error(`parser: ${msg} on line ${line}`);
    }
}

export type Resolve =
    | { tag: "fn"; stmt: Stmt }
    | { tag: "param"; stmt: Stmt; i: number }
    | { tag: "let"; stmt: Stmt }
    | { tag: "loop"; stmt: Stmt };

export function resolveToString(res: Resolve): string {
    switch (res.tag) {
        case "fn":
            return `fn(id: ${res.stmt.id}, line: ${res.stmt.line})`;
        case "param":
            return `param(i: ${res.i})`;
        case "let":
            return `let(id: ${res.stmt.id}, line: ${res.stmt.line})`;
        case "loop":
            return `loop(id: ${res.stmt.id}, line: ${res.stmt.line})`;
    }
}

export class Resols {
    public constructor(
        private stmtResols: Map<number, Resolve>,
        private exprResols: Map<number, Resolve>,
    ) {}

    public stmt(stmt: Stmt): Resolve | undefined {
        return this.stmtResols.get(stmt.id);
    }

    public expr(expr: Expr): Resolve | undefined {
        return this.exprResols.get(expr.id);
    }
}

interface Syms {
    val(ident: string): Resolve | undefined;
    defineVal(ident: string, res: Resolve): void;
}

export class RootSyms implements Syms {
    private exprResols = new Map<string, Resolve>();

    val(ident: string): Resolve | undefined {
        return this.exprResols.get(ident);
    }

    defineVal(ident: string, res: Resolve): void {
        this.exprResols.set(ident, res);
    }
}

export class FnSyms implements Syms {
    private exprResols = new Map<string, Resolve>();

    public constructor(
        private parent: Syms,
    ) {}

    val(ident: string): Resolve | undefined {
        const local = this.exprResols.get(ident);
        if (local) {
            return local;
        }
        const parent = this.parent.val(ident);
        if (!parent) {
            return undefined;
        }
        if (parent.tag === "let") {
            return undefined;
        }
        return parent;
    }

    defineVal(ident: string, res: Resolve): void {
        this.exprResols.set(ident, res);
    }
}

export class NormalSyms implements Syms {
    private exprResols = new Map<string, Resolve>();

    public constructor(
        private parent: Syms,
    ) {}

    val(ident: string): Resolve | undefined {
        return this.exprResols.get(ident) ?? this.parent.val(ident);
    }

    defineVal(ident: string, res: Resolve): void {
        this.exprResols.set(ident, res);
    }
}

export class Resolver {
    private syms: Syms = new RootSyms();
    private stmtResols = new Map<number, Resolve>();
    private exprResols = new Map<number, Resolve>();

    private blockFnsStack: Stmt[][] = [];
    private loopStack: Stmt[] = [];

    public errorOccured = false;

    public constructor(
        private ast: Stmt[],
    ) {}

    public resolve(): Resols {
        this.resolveStmts(this.ast);
        return new Resols(
            this.stmtResols,
            this.exprResols,
        );
    }

    private resolveStmts(stmts: Stmt[]) {
        this.blockFnsStack.push([]);
        for (const stmt of stmts) {
            this.resolveStmt(stmt);
        }
        const blockFns = this.blockFnsStack.pop()!;
        for (const fn of blockFns) {
            const outerLoops = this.loopStack;
            this.loopStack = [];

            const outerSyms = this.syms;
            this.syms = new FnSyms(outerSyms);

            const k = fn.kind;
            if (k.tag !== "fn") {
                throw new Error();
            }
            for (const [i, param] of k.params.entries()) {
                this.syms.defineVal(param, { tag: "param", stmt: fn, i });
            }
            this.resolveBlock(k.body);

            this.syms = outerSyms;
            this.loopStack = outerLoops;
        }
    }

    private resolveBlock(block: Block) {
        const outerSyms = this.syms;
        this.syms = new NormalSyms(outerSyms);
        this.resolveStmts(block.stmts);
        this.syms = outerSyms;
    }

    private resolveStmt(stmt: Stmt) {
        const k = stmt.kind;
        switch (k.tag) {
            case "error":
                return;
            case "fn":
                this.syms.defineVal(k.ident, { tag: "fn", stmt });
                this.blockFnsStack.at(-1)!.push(stmt);
                return;
            case "let":
                this.syms.defineVal(k.ident, { tag: "let", stmt });
                this.resolveExpr(k.expr);
                return;
            case "loop":
                this.loopStack.push(stmt);
                this.resolveBlock(k.body);
                this.loopStack.pop();
                return;
            case "if":
                this.resolveExpr(k.expr);
                this.resolveBlock(k.truthy);
                k.falsy && this.resolveBlock(k.falsy);
                return;
            case "return":
                k.expr && this.resolveExpr(k.expr);
                return;
            case "break": {
                const loop = this.loopStack.at(-1);
                if (!loop) {
                    return this.report("break outside loop", stmt.line);
                }
                this.stmtResols.set(stmt.id, { tag: "loop", stmt: loop });
                return;
            }
            case "assign":
                this.resolveExpr(k.subject);
                this.resolveExpr(k.expr);
                return;
            case "expr":
                this.resolveExpr(k.expr);
                return;
        }
        const _: never = k;
    }

    private resolveExpr(expr: Expr) {
        const k = expr.kind;
        switch (k.tag) {
            case "error":
                return;
            case "ident": {
                const res = this.syms.val(k.ident);
                if (!res) {
                    this.report(`ident '${k.ident}' not defined`, expr.line);
                    return;
                }
                this.exprResols.set(expr.id, res);
                return;
            }
            case "int":
                return;
            case "call":
                this.resolveExpr(k.expr);
                for (const arg of k.args) {
                    this.resolveExpr(arg);
                }
                return;
            case "binary":
                this.resolveExpr(k.left);
                this.resolveExpr(k.right);
                return;
        }
        const _: never = k;
    }

    private report(msg: string, line: number) {
        this.errorOccured = true;
        //console.error(`parser: ${msg} on line ${line}`);
        throw new Error(`parser: ${msg} on line ${line}`);
    }
}

export class Parser {
    private toks: Tok[];
    private i = 0;

    private stmtIds = 0;
    private exprIds = 0;

    private last: Tok;
    private eaten?: Tok;

    public errorOccured = false;

    public constructor(private text: string) {
        this.toks = lex(this.text);
        this.last = this.toks[0];
    }

    public parse() {
        return this.parseStmts();
    }

    private parseStmts(): Stmt[] {
        const stmts: Stmt[] = [];
        while (!this.done()) {
            stmts.push(this.parseStmt());
        }
        return stmts;
    }

    private parseBlock(): Block {
        const lineEntry = this.curr().line;
        this.step();
        const stmts: Stmt[] = [];
        if (!this.done() && !this.test("}")) {
            stmts.push(this.parseStmt());
            while (!this.done() && !this.test("}")) {
                stmts.push(this.parseStmt());
            }
        }
        if (!this.eat("}")) {
            this.report("expected '}'");
            return { lineEntry, lineExit: 0, stmts: [] };
        }
        const lineExit = this.eaten!.line;
        return { lineEntry, lineExit, stmts };
    }

    private parseStmt(): Stmt {
        if (this.test("fn")) {
            return this.parseFunStmt();
        } else if (this.test("let")) {
            return this.parseLetStmt();
        } else if (this.test("loop")) {
            return this.parseLoopStmt();
        } else if (this.test("if")) {
            return this.parseIfStmt();
        } else if (this.test("return")) {
            return this.parseReturnStmt();
        } else if (this.test("break")) {
            return this.parseBreakStmt();
        } else {
            const subject = this.parseExpr();
            let stmt: Stmt;
            if (this.eat("=")) {
                const expr = this.parseExpr();
                stmt = this.stmt(
                    { tag: "assign", subject, expr },
                    subject.line,
                );
            } else {
                stmt = this.stmt({ tag: "expr", expr: subject }, subject.line);
            }
            if (!this.eat(";")) {
                this.report("expected ';'");
                return this.stmt({ tag: "error" }, stmt.line);
            }
            return stmt;
        }
    }

    private parseFunStmt(): Stmt {
        const line = this.curr().line;
        this.step();
        if (!this.eat("ident")) {
            this.report("expected 'ident'");
            return this.stmt({ tag: "error" }, line);
        }
        const ident = this.eaten!.identVal!;
        if (!this.eat("(")) {
            this.report("expected '('");
            return this.stmt({ tag: "error" }, line);
        }
        const params: string[] = [];
        if (!this.done() && !this.test(")")) {
            if (!this.eat("ident")) {
                this.report("expected 'ident'");
                return this.stmt({ tag: "error" }, line);
            }
            params.push(this.eaten!.identVal!);
            while (!this.done() && !this.test(")")) {
                if (!this.eat(",")) {
                    this.report("expected ','");
                    return this.stmt({ tag: "error" }, line);
                }
                if (this.test(")")) {
                    break;
                }
                if (!this.eat("ident")) {
                    this.report("expected 'ident'");
                    return this.stmt({ tag: "error" }, line);
                }
                params.push(this.eaten!.identVal!);
            }
        }
        if (!this.eat(")")) {
            this.report("expected ')'");
            return this.stmt({ tag: "error" }, line);
        }
        if (!this.test("{")) {
            this.report("expected block");
            return this.stmt({ tag: "error" }, line);
        }
        const body = this.parseBlock();
        return this.stmt({ tag: "fn", ident, params, body }, line);
    }

    private parseLetStmt(): Stmt {
        const line = this.curr().line;
        this.step();
        if (!this.eat("ident")) {
            this.report("expected 'ident'");
            return this.stmt({ tag: "error" }, line);
        }
        const ident = this.eaten!.identVal!;
        if (!this.eat("=")) {
            this.report("expected '='");
            return this.stmt({ tag: "error" }, line);
        }
        const expr = this.parseExpr();
        if (!this.eat(";")) {
            this.report("expected ';'");
            return this.stmt({ tag: "error" }, line);
        }
        return this.stmt({ tag: "let", ident, expr }, line);
    }

    private parseLoopStmt(): Stmt {
        const line = this.curr().line;
        this.step();
        if (!this.test("{")) {
            this.report("expected block");
            return this.stmt({ tag: "error" }, line);
        }
        const body = this.parseBlock();
        return this.stmt({ tag: "loop", body }, line);
    }

    private parseIfStmt(): Stmt {
        const line = this.curr().line;
        this.step();
        const expr = this.parseExpr();
        if (!this.test("{")) {
            this.report("expected block");
            return this.stmt({ tag: "error" }, line);
        }
        const truthy = this.parseBlock();
        if (!this.eat("else")) {
            return this.stmt({ tag: "if", expr, truthy }, line);
        }
        if (!this.test("{")) {
            this.report("expected block");
            return this.stmt({ tag: "error" }, line);
        }
        const falsy = this.parseBlock();
        return this.stmt({ tag: "if", expr, truthy, falsy }, line);
    }

    private parseReturnStmt(): Stmt {
        const line = this.curr().line;
        this.step();
        if (this.eat(";")) {
            return this.stmt({ tag: "return" }, line);
        }
        const expr = this.parseExpr();
        if (!this.eat(";")) {
            this.report("expected ';'");
            return this.stmt({ tag: "error" }, line);
        }
        return this.stmt({ tag: "return", expr }, line);
    }

    private parseBreakStmt(): Stmt {
        const line = this.curr().line;
        this.step();
        if (!this.eat(";")) {
            this.report("expected ';'");
            return this.stmt({ tag: "error" }, line);
        }
        return this.stmt({ tag: "break" }, line);
    }

    private parseExpr(): Expr {
        return this.parseBinaryExpr();
    }

    private parseBinaryExpr(prec = 4): Expr {
        if (prec == 0) {
            return this.parsePostfixExpr();
        }
        const ops: [BinaryOp, number][] = [
            ["<", 4],
            ["==", 3],
            ["+", 2],
            ["*", 1],
        ];

        let left = this.parseBinaryExpr(prec - 1);

        let should_continue = true;
        while (should_continue) {
            should_continue = false;
            for (const [op, p] of ops) {
                if (prec >= p && this.eat(op)) {
                    const right = this.parseBinaryExpr(prec - 1);
                    left = this.expr(
                        { tag: "binary", op, left, right },
                        left.line,
                    );
                    should_continue = true;
                    break;
                }
            }
        }
        return left;
    }

    private parsePostfixExpr(): Expr {
        let expr = this.parseOperandExpr();
        while (true) {
            if (this.eat("(")) {
                const args: Expr[] = [];
                if (!this.done() && !this.test(")")) {
                    args.push(this.parseExpr());
                    while (!this.done() && !this.test(")")) {
                        if (!this.eat(",")) {
                            this.report("expected ','");
                            return this.expr({ tag: "error" }, this.last.line);
                        }
                        if (this.test(")")) {
                            break;
                        }
                        args.push(this.parseExpr());
                    }
                }
                if (!this.eat(")")) {
                    this.report("expected ')'");
                    return this.expr({ tag: "error" }, this.last.line);
                }
                expr = this.expr({ tag: "call", expr, args }, expr.line);
            } else {
                break;
            }
        }
        return expr;
    }

    private parseOperandExpr(): Expr {
        if (this.eat("ident")) {
            return this.expr(
                { tag: "ident", ident: this.eaten!.identVal! },
                this.eaten!.line,
            );
        } else if (this.eat("int")) {
            return this.expr(
                { tag: "int", val: this.eaten!.intVal! },
                this.eaten!.line,
            );
        } else {
            this.report("expected expr");
            return this.expr({ tag: "error" }, this.last!.line);
        }
    }

    private stmt(kind: StmtKind, line: number): Stmt {
        const id = this.stmtIds++;
        return { id, line, kind };
    }

    private expr(kind: ExprKind, line: number): Expr {
        const id = this.exprIds++;
        return { id, line, kind };
    }

    private eat(type: string): boolean {
        if (this.test(type)) {
            this.eaten = this.curr();
            this.step();
            return true;
        }
        return false;
    }
    private step() {
        this.i += 1;
        if (!this.done()) {
            this.last = this.curr();
        }
    }
    private test(type: string) {
        return !this.done() && this.curr().type === type;
    }
    private curr(): Tok {
        return this.toks[this.i];
    }
    private done(): boolean {
        return this.i >= this.toks.length;
    }

    private report(msg: string, line = this.last.line) {
        this.errorOccured = true;
        //console.error(`parser: ${msg} on line ${line}`);
        throw new Error(`parser: ${msg} on line ${line}`);
    }
}

export type Tok = {
    type: string;
    line: number;
    intVal?: number;
    stringVal?: string;
    identVal?: string;
};

export function lex(text: string): Tok[] {
    const ops = "(){}<>+*=,;\n";
    const kws = ["let", "fn", "return", "if", "else", "loop", "break"];

    return ops
        .split("")
        .reduce((text, op) =>
            text
                .replaceAll(/#.*?$/mg, "")
                .replaceAll(op, ` ${op} `)
                .replaceAll(" =  = ", " == "), text)
        .split(/[ \t\r]/)
        .filter((val) => val !== "")
        .reduce<[[string, number][], number]>(
            ([toks, line], tok) =>
                [
                    [...toks, [tok, line]],
                    tok === "\n" ? line + 1 : line,
                ] as const,
            [[], 1],
        )[0]
        .filter(([val, _line]) => val !== "\n")
        .map(([val, line]): Tok => {
            if (/[0-9]+/.test(val)) {
                return { type: "int", line, intVal: parseInt(val) };
            } else if (/[a-zA-Z_][a-zA-Z0-9_]*/.test(val)) {
                return kws.includes(val)
                    ? { type: val, line }
                    : { type: "ident", line, identVal: val };
            } else if (/".*?"/.test(val)) {
                return {
                    type: "ident",
                    line,
                    identVal: val
                        .slice(1, val.length - 1)
                        .replace(/\\ /g, " ")
                        .replace(/\\n/g, "\n")
                        .replace(/\\/g, ""),
                };
            } else {
                return { type: val, line };
            }
        });
}

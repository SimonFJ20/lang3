import * as ast from "./ast.ts";
import { Checker, Resols } from "./front.ts";
import { Block, Fn, Local, StmtKind, TerKind } from "./msr.ts";
import { Ty, tyToString } from "./ty.ts";

export class AstToMsrLowerer {
    public constructor(
        private ast: ast.Stmt[],
        private re: Resols,
        private ch: Checker,
    ) {}

    public lower(): Fn[] {
        const fns: Fn[] = [];
        for (const stmt of this.ast) {
            if (stmt.kind.tag !== "fn") {
                continue;
            }
            const fn = new FnLowerer(
                stmt,
                stmt.kind,
                this.re,
                this.ch,
            ).lower();
            fns.push(fn);
        }
        return fns;
    }
}

class FnLowerer {
    private blocks: Block[] = [];
    private locals: Local[] = [];

    private returnLocal!: number;
    private paramLocals: number[] = [];
    private letLocals = new Map<number, number>();

    private returnBlock!: number;
    private loopExitBlocks = new Map<number, number>();

    public errorOccured = false;

    public constructor(
        private stmt: ast.Stmt,
        private kind: ast.FnStmt,
        private re: Resols,
        private ch: Checker,
    ) {}

    public lower(): Fn {
        const ty = this.ch.fnStmtTy(this.stmt);
        if (ty.tag !== "fn") {
            throw new Error();
        }

        this.returnLocal = this.pushLocal(ty.returnTy);
        for (const paramTy of ty.params) {
            const local = this.pushLocal(paramTy);
            this.paramLocals.push(local);
        }

        this.returnBlock = this.pushBlock(this.kind.body.lineExit);
        this.pushBlock(this.kind.body.lineEntry);

        this.lowerBlock(this.kind.body);

        this.setTer({ tag: "return" }, this.kind.body.lineExit);
        return {
            blocks: this.blocks,
            locals: this.locals,
        };
    }

    private lowerBlock(block: ast.Block) {
        for (const stmt of block.stmts) {
            this.lowerStmt(stmt);
        }
    }

    private lowerStmt(stmt: ast.Stmt) {
        const l = stmt.line;
        const k = stmt.kind;
        switch (k.tag) {
            case "error":
                this.pushStmt({ tag: "error" }, l);
                return;
            case "fn":
                this.report("nested functions not supported", l);
                return;
            case "let": {
                const ty = this.ch.letStmtTy(stmt);
                const local = this.pushLocal(ty);
                this.letLocals.set(stmt.id, local);
                this.lowerExpr(k.expr);
                this.pushStmt({ tag: "store_local", local }, l);
                return;
            }
            case "loop": {
                const entry = this.blockId();
                const exit = this.pushBlock(k.body.lineExit);
                const loop = this.pushBlock(k.body.lineEntry);

                this.loopExitBlocks.set(stmt.id, exit);
                this.lowerBlock(k.body);

                this.blocks[entry].ter = {
                    line: l,
                    kind: { tag: "jmp", target: loop },
                };
                this.blocks[loop].ter = {
                    line: l,
                    kind: { tag: "jmp", target: k.body.lineExit },
                };
                return;
            }
            case "if": {
                const entry = this.blockId();
                this.lowerExpr(k.expr);
                const exit = this.pushBlock(
                    k.falsy?.lineExit ?? k.truthy.lineExit,
                );
                const truthy = this.pushBlock(k.truthy.lineEntry);
                this.lowerBlock(k.truthy);
                this.setTer({ tag: "jmp", target: exit }, k.truthy.lineExit);

                let falsy = exit;
                if (k.falsy) {
                    falsy = this.pushBlock(k.falsy?.lineEntry);
                    this.lowerBlock(k.falsy);
                    this.setTer({ tag: "jmp", target: exit }, k.falsy.lineExit);
                    this.blocks[entry].ter = {
                        kind: { tag: "if", truthy, falsy },
                        line: l,
                    };
                }

                this.blocks[entry].ter = {
                    kind: { tag: "if", truthy, falsy },
                    line: l,
                };
                return;
            }
            case "return": {
                if (k.expr) {
                    this.lowerExpr(k.expr);
                    this.pushStmt({
                        tag: "store_local",
                        local: this.returnLocal,
                    }, l);
                }
                this.setTer({ tag: "jmp", target: this.returnBlock }, l);
                return;
            }
            case "break": {
                const re = this.re.stmt(stmt)!;
                const target = this.loopExitBlocks.get(re!.stmt.id)!;
                this.setTer({ tag: "jmp", target }, l);
                return;
            }
            case "assign": {
                const re = this.re.expr(k.subject)!;
                let local: number;
                switch (re.tag) {
                    case "fn":
                        this.report("cannot assign to expression", stmt.line);
                        this.pushStmt({ tag: "error" }, stmt.line);
                        return;
                    case "let":
                        local = this.letLocals.get(re.stmt.id)!;
                        break;
                    case "loop":
                        this.report("cannot assign to expression", stmt.line);
                        this.pushStmt({ tag: "error" }, stmt.line);
                        return;
                    case "param":
                        local = this.paramLocals[re.i];
                        break;
                }
                this.lowerExpr(k.expr);
                this.pushStmt({ tag: "store_local", local }, l);
                return;
            }
            case "expr":
                this.lowerExpr(k.expr);
                this.pushStmt({ tag: "pop" }, l);
                return;
        }
        const _: never = k;
    }

    private lowerExpr(expr: ast.Expr) {
        const l = expr.line;
        const k = expr.kind;
        switch (k.tag) {
            case "error":
                this.pushStmt({ tag: "error" }, l);
                return;
            case "ident": {
                const re = this.re.expr(expr);
                return;
            }
            case "int":
            case "call":
            case "binary":
        }
        const _: never = k;
    }

    private pushBlock(line: number): number {
        this.blocks.push({
            line,
            stmts: [],
            ter: { kind: { tag: "error" }, line },
        });
        return this.blocks.length - 1;
    }

    private pushLocal(ty: Ty): number {
        this.locals.push({ ty });
        return this.locals.length - 1;
    }

    private blockId(): number {
        return this.blocks.length - 1;
    }

    private block(): Block {
        return this.blocks.at(-1)!;
    }

    private pushStmt(kind: StmtKind, line: number) {
        this.block().stmts.push({ kind, line });
    }

    private setTer(kind: TerKind, line: number) {
        this.block().ter = { kind, line };
    }

    private report(msg: string, line: number) {
        this.errorOccured = true;
        //console.error(`parser: ${msg} on line ${line}`);
        throw new Error(`parser: ${msg} on line ${line}`);
    }
}

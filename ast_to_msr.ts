import * as ast from "./ast.ts";
import { Checker, Resols } from "./front.ts";
import { Block, BlockId, Fn, Local, StmtKind, TerKind } from "./msr.ts";
import { Ty } from "./ty.ts";

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
    private blocks = new Map<BlockId, Block>();
    private locals: Local[] = [];

    private currentBlock!: Block;
    private blockIds = 0;

    private returnLocal!: number;
    private paramLocals: number[] = [];
    private letLocals = new Map<number, number>();

    private entryBlock!: Block;
    private returnBlock!: Block;
    private loopExitBlocks = new Map<number, number>();

    public errorOccured = false;

    public constructor(
        private stmt: ast.Stmt,
        private kind: ast.FnStmt,
        private re: Resols,
        private ch: Checker,
    ) {}

    public lower(): Fn {
        if (this.stmt.kind.tag !== "fn") {
            throw new Error();
        }
        const ty = this.ch.fnStmtTy(this.stmt);
        if (ty.tag !== "fn") {
            throw new Error();
        }

        this.returnLocal = this.pushLocal(ty.returnTy);
        for (const paramTy of ty.params) {
            const local = this.pushLocal(paramTy);
            this.paramLocals.push(local);
        }

        this.returnBlock = this.newBlock();

        this.entryBlock = this.pushBlock(
            this.newBlock(),
        );
        this.lowerBlock(this.kind.body);

        this.setTer(
            { tag: "jmp", target: this.returnBlock.id },
        );
        this.pushBlock(this.returnBlock);
        this.returnBlock.ter = {
            kind: { tag: "return" },
        };
        return {
            astStmt: this.stmt,
            ident: this.stmt.kind.ident,
            blocks: this.blocks,
            locals: this.locals,
            entry: this.entryBlock.id,
            exit: this.returnBlock.id,
            returnLocal: this.returnLocal,
            paramLocals: this.paramLocals,
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
                this.pushStmt({ tag: "error" });
                return;
            case "fn":
                this.report("nested functions not supported", l);
                return;
            case "let": {
                const ty = this.ch.letStmtTy(stmt);
                const local = this.pushLocal(ty);
                this.locals[local].astStmt = stmt;
                this.letLocals.set(stmt.id, local);
                if (k.expr) {
                    this.lowerExpr(k.expr);
                    this.pushStmt({ tag: "store_local", local });
                }
                return;
            }
            case "loop": {
                const entry = this.block();
                const loopBreak = this.newBlock();
                const loop = this.pushBlock(this.newBlock());

                this.loopExitBlocks.set(stmt.id, loopBreak.id);
                this.lowerBlock(k.body);
                const loopExit = this.block();

                entry.ter = {
                    kind: { tag: "jmp", target: loop.id },
                };
                loopExit.ter = {
                    kind: { tag: "jmp", target: loop.id },
                };

                this.pushBlock(loopBreak);
                return;
            }
            case "if": {
                this.lowerExpr(k.expr);
                const entry = this.block();
                const exit = this.newBlock();
                const truthy = this.pushNewBlock().id;
                this.lowerBlock(k.truthy);
                this.setTer({ tag: "jmp", target: exit.id });

                let falsy = exit.id;
                if (k.falsy) {
                    falsy = this.pushNewBlock().id;
                    this.lowerBlock(k.falsy);
                    this.setTer(
                        { tag: "jmp", target: exit.id },
                    );
                    entry.ter = {
                        kind: { tag: "if", truthy, falsy },
                    };
                }

                entry.ter = {
                    kind: { tag: "if", truthy, falsy },
                };
                this.pushBlock(exit);
                return;
            }
            case "return": {
                if (k.expr) {
                    this.lowerExpr(k.expr);
                    this.pushStmt({
                        tag: "store_local",
                        local: this.returnLocal,
                    });
                }
                this.setTer({ tag: "jmp", target: this.returnBlock.id });
                this.pushNewBlock();
                return;
            }
            case "break": {
                const re = this.re.stmt(stmt)!;
                const target = this.loopExitBlocks.get(re!.stmt.id)!;
                this.setTer({ tag: "jmp", target });
                this.pushNewBlock();
                return;
            }
            case "assign": {
                const re = this.re.expr(k.subject)!;
                let local: number;
                switch (re.tag) {
                    case "fn":
                        this.report("cannot assign to expression", stmt.line);
                        this.pushStmt({ tag: "error" });
                        return;
                    case "let":
                        local = this.letLocals.get(re.stmt.id)!;
                        break;
                    case "loop":
                        this.report("cannot assign to expression", stmt.line);
                        this.pushStmt({ tag: "error" });
                        return;
                    case "param":
                        local = this.paramLocals[re.i];
                        break;
                }
                this.lowerExpr(k.expr);
                this.pushStmt({ tag: "store_local", local });
                return;
            }
            case "expr":
                this.lowerExpr(k.expr);
                this.pushStmt({ tag: "pop" });
                return;
        }
        const _: never = k;
    }

    private lowerExpr(expr: ast.Expr) {
        const ty = this.ch.exprTy(expr);
        const l = expr.line;
        const k = expr.kind;
        switch (k.tag) {
            case "error":
                this.pushStmt({ tag: "error" });
                return;
            case "ident": {
                const re = this.re.expr(expr);
                if (!re) {
                    throw new Error();
                }
                switch (re.tag) {
                    case "fn": {
                        const ty = this.ch.fnStmtTy(re.stmt);
                        this.pushStmt({
                            tag: "push",
                            val: { tag: "fn", stmt: re.stmt },
                            ty,
                        });
                        break;
                    }
                    case "param": {
                        const local = this.paramLocals[re.i];
                        this.pushStmt({ tag: "load_local", local });
                        break;
                    }
                    case "let": {
                        const local = this.letLocals.get(re.stmt.id)!;
                        if (!local) {
                            throw new Error();
                        }
                        this.pushStmt({ tag: "load_local", local });
                        break;
                    }
                    case "loop":
                        throw new Error();
                }
                return;
            }
            case "int": {
                this.pushStmt({
                    tag: "push",
                    val: { tag: "int", val: k.val },
                    ty,
                });
                return;
            }
            case "call": {
                for (const arg of k.args) {
                    this.lowerExpr(arg);
                }
                this.lowerExpr(k.expr);
                this.pushStmt({ tag: "call", args: k.args.length });
                return;
            }
            case "binary": {
                this.lowerExpr(k.left);
                this.lowerExpr(k.right);
                switch (k.op) {
                    case "<":
                        this.pushStmt({ tag: "lt", ty });
                        break;
                    case "==":
                        this.pushStmt({ tag: "eq", ty });
                        break;
                    case "+":
                        this.pushStmt({ tag: "add", ty });
                        break;
                    case "*":
                        this.pushStmt({ tag: "mul", ty });
                        break;
                }
                return;
            }
        }
        const _: never = k;
    }

    private pushNewBlock(): Block {
        return this.pushBlock(this.newBlock());
    }

    private newBlock(): Block {
        const id = this.blockIds++;
        const block: Block = { id, stmts: [] };
        this.blocks.set(block.id, block);
        return block;
    }

    private pushBlock(block: Block): Block {
        this.currentBlock = block;
        return block;
    }

    private pushLocal(ty: Ty): number {
        this.locals.push({ ty });
        return this.locals.length - 1;
    }

    private block(): Block {
        return this.currentBlock;
    }

    private pushStmt(kind: StmtKind) {
        this.block().stmts.push({ kind });
    }

    private setTer(kind: TerKind) {
        this.block().ter = { kind };
    }

    private report(msg: string, line: number) {
        this.errorOccured = true;
        //console.error(`parser: ${msg} on line ${line}`);
        throw new Error(`parser: ${msg} on line ${line}`);
    }
}

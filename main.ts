import * as ast from "./ast.ts";
import { Checker, Parser, Resolver } from "./front.ts";
import * as yaml from "jsr:@std/yaml";

async function main() {
    const text = await Deno.readTextFile(Deno.args[0]);
    const ast = new Parser(text).parse();
    const re = new Resolver(ast).resolve();
    const ch = new Checker(re);

    const dedup = new AstDedupper();
    const dedupAst = ast.map((stmt) => dedup.stmt(stmt));

    console.log(yaml.stringify(dedupAst, {}));
    console.log(dedup);
}

function unreachable(_: never): never {
    throw new Error();
}

class AstDedupper {
    private hash = new AstHasher();

    private blocks = new Map<string, ast.Block>();
    private stmts = new Map<string, ast.Stmt>();
    private exprs = new Map<string, ast.Expr>();

    public block(block: ast.Block) {
        const hash = this.hash.block(block);
        if (this.blocks.has(hash)) {
            return this.blocks.get(hash)!;
        }
        block.stmts = block.stmts
            .map((stmt) => this.stmt(stmt));
        this.blocks.set(hash, block);
        return block;
    }

    public stmt(stmt: ast.Stmt) {
        const hash = this.hash.stmt(stmt);
        if (this.stmts.has(hash)) {
            return this.stmts.get(hash)!;
        }
        const k = stmt.kind;
        switch (k.tag) {
            case "error":
                break;
            case "fn":
                k.body = this.block(k.body);
                break;
            case "let":
                k.expr = this.expr(k.expr);
                break;
            case "loop":
                k.body = this.block(k.body);
                break;
            case "if":
                k.truthy = this.block(k.truthy);
                k.falsy = k.falsy && this.block(k.falsy);
                break;
            case "return":
                k.expr = k.expr && this.expr(k.expr);
                break;
            case "break":
                break;
            case "assign":
                k.subject = this.expr(k.subject);
                k.expr = this.expr(k.expr);
                break;
            case "expr":
                k.expr = this.expr(k.expr);
                break;
            default:
                unreachable(k);
        }
        this.stmts.set(hash, stmt);
        return stmt;
    }

    public expr(expr: ast.Expr): ast.Expr {
        const hash = this.hash.expr(expr);
        if (this.exprs.has(hash)) {
            return this.exprs.get(hash)!;
        }
        const k = expr.kind;
        switch (k.tag) {
            case "error":
                break;
            case "ident":
                break;
            case "int":
                break;
            case "call":
                [k.expr, ...k.args] = [k.expr, ...k.args]
                    .map((expr) => this.expr(expr));
                break;
            case "binary":
                [k.left, k.right] = [k.left, k.right]
                    .map((expr) => this.expr(expr));
                break;
            default:
                unreachable(k);
        }
        this.exprs.set(hash, expr);
        return expr;
    }
}

class AstHasher {
    private blockHashes = new Map<number, string>();
    private stmtHashes = new Map<number, string>();
    private exprHashes = new Map<number, string>();

    public block(block: ast.Block): string {
        if (this.blockHashes.has(block.id)) {
            return this.blockHashes.get(block.id)!;
        }
        const hash = block.stmts.length > 0
            ? `{\n${block.stmts.map((stmt) => this.stmt(stmt)).join("\n")}\n}`
            : "{}";
        this.blockHashes.set(block.id, hash);
        return hash;
    }

    public stmt(stmt: ast.Stmt): string {
        if (this.stmtHashes.has(stmt.id)) {
            return this.stmtHashes.get(stmt.id)!;
        }
        const hash = ((): string => {
            const k = stmt.kind;
            switch (k.tag) {
                case "error":
                    return "error;";
                case "fn":
                    return `fn ${k.ident};`;
                case "let":
                    return `let ${k.ident} = ${this.expr(k.expr)}`;
                case "loop":
                    return `loop ${this.block(k.body)}`;
                case "if":
                    return `if ${this.expr(k.expr)} ${this.block(k.truthy)}${
                        k.falsy && ` else ${this.block(k.falsy)}` || ""
                    }`;
                case "return":
                    return `return${k.expr && ` ${this.expr(k.expr)}` || ""};`;
                case "break":
                    return `return;`;
                case "assign":
                    return `assign ${this.expr(k.subject)} = ${
                        this.expr(k.expr)
                    };`;
                case "expr":
                    return `expr ${this.expr(k.expr)};`;
            }
            const _: never = k;
        })();
        this.stmtHashes.set(stmt.id, hash);
        return hash;
    }

    public expr(expr: ast.Expr): string {
        if (this.exprHashes.has(expr.id)) {
            return this.exprHashes.get(expr.id)!;
        }
        const hash = ((): string => {
            const k = expr.kind;
            switch (k.tag) {
                case "error":
                    return "error";
                case "ident":
                    return `ident ${k.ident}`;
                case "int":
                    return `int ${k.val}`;
                case "call":
                    return `call ${this.expr(k.expr)}(${
                        k.args.map((expr) => this.expr(expr)).join(", ")
                    })`;
                case "binary":
                    return `binary ${this.expr(k.left)} ${k.op} ${
                        this.expr(k.right)
                    }`;
            }
            const _: never = k;
        })();
        this.exprHashes.set(expr.id, hash);
        return hash;
    }
}

main();

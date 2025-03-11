import * as ast from "./ast.ts";
import { AstToMsrLowerer } from "./ast_to_msr.ts";
import { Checker, Parser, Resolver } from "./front.ts";
import * as yaml from "jsr:@std/yaml";
import { optimizeMsr } from "./optimize_msr.ts";
import { MsrStringifyer } from "./msr_stringifyer.ts";
import * as msr from "./msr.ts";

async function main() {
    //const text = await Deno.readTextFile(Deno.args[0]);
    //const ast = new Parser(text).parse();
    //const re = new Resolver(ast).resolve();
    //const ch = new Checker(re);
    //
    ////console.log(yaml.stringify(ast));
    ////
    //const lowerer = new AstToMsrLowerer(ast, re, ch);
    //const msr = lowerer.lower();

    const stmt = (kind: msr.StmtKind): msr.Stmt => ({ line: 0, kind });
    const pushIntStmt = (val: number): msr.Stmt => ({
        line: 0,
        kind: { tag: "push", val: { tag: "int", val }, ty: { tag: "int" } },
    });

    const msr: msr.Fn[] = [{
        astStmt: undefined as unknown as ast.Stmt,
        ident: "ident",
        locals: [
            { ty: { tag: "int" } }, // i
            { ty: { tag: "int" } }, // s
            { ty: { tag: "int" } },
        ],
        blocks: new Map<number, msr.Block>([
            [0, {
                id: 0,
                line: 0,
                stmts: [
                    pushIntStmt(1),
                    { line: 0, kind: { tag: "store_local", local: 0 } },
                ],
                ter: { line: 0, kind: { tag: "jmp", target: 1 } },
            }],
            [1, {
                id: 1,
                line: 0,
                stmts: [
                    { line: 0, kind: { tag: "load_local", local: 0 } },
                ],
                ter: { line: 0, kind: { tag: "if", truthy: 2, falsy: 3 } },
            }],
            [2, {
                id: 2,
                line: 0,
                stmts: [
                    pushIntStmt(0),
                    { line: 0, kind: { tag: "store_local", local: 1 } },
                ],
                ter: { line: 0, kind: { tag: "jmp", target: 3 } },
            }],
            [3, {
                id: 3,
                line: 0,
                stmts: [
                    { line: 0, kind: { tag: "load_local", local: 1 } },
                    { line: 0, kind: { tag: "load_local", local: 0 } },
                    { line: 0, kind: { tag: "add", ty: { tag: "int" } } },
                    { line: 0, kind: { tag: "store_local", local: 1 } },
                    { line: 0, kind: { tag: "load_local", local: 0 } },
                    pushIntStmt(0),
                    { line: 0, kind: { tag: "add", ty: { tag: "int" } } },
                    { line: 0, kind: { tag: "store_local", local: 0 } },
                    { line: 0, kind: { tag: "load_local", local: 0 } },
                ],
                ter: { line: 0, kind: { tag: "if", truthy: 1, falsy: 4 } },
            }],
            [4, {
                id: 4,
                line: 0,
                stmts: [
                    { line: 0, kind: { tag: "load_local", local: 1 } },
                    { line: 0, kind: { tag: "store_local", local: 2 } },
                ],
                ter: { line: 0, kind: { tag: "return" } },
            }],
        ]),
        entry: 0,
        returnLocal: 0,
        paramLocals: [],
    }];

    const msrStr = new MsrStringifyer();
    console.log(msr.map((fn) => msrStr.fn(fn)).join("\n"));

    console.log("\n=== OPTIMIZATION ===\n");
    optimizeMsr(msr);
    // console.log(msr.map((fn) => msrStr.fn(fn)).join("\n"));
}

main();

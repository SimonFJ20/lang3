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
    //// console.log(yaml.stringify(ast));
    ////
    //const lowerer = new AstToMsrLowerer(ast, re, ch);
    //const msr = lowerer.lower();

    //const msr = exampleProgram();
    const msr = exampleProgram912();

    const msrStr = new MsrStringifyer();
    console.log(msr.map((fn) => msrStr.fn(fn)).join("\n"));

    console.log("\n=== OPTIMIZATION ===\n");
    optimizeMsr(msr);
    // console.log(msr.map((fn) => msrStr.fn(fn)).join("\n"));
}

function exampleProgram912(): msr.Fn[] {
    const pushInt = (val: number): msr.Stmt => ({
        kind: { tag: "push", val: { tag: "int", val }, ty: { tag: "int" } },
    });
    const storeLocal = (local: number): msr.Stmt => ({
        kind: { tag: "store_local", local },
    });
    const loadLocal = (local: number): msr.Stmt => ({
        kind: { tag: "load_local", local },
    });

    const [a, b, c, d, i, y, z] = [0, 1, 2, 3, 4, 5, 6] as const;

    return [{
        astStmt: undefined as unknown as ast.Stmt,
        ident: "ident",
        locals: [
            { ty: { tag: "int" } }, // a
            { ty: { tag: "int" } }, // b
            { ty: { tag: "int" } }, // c
            { ty: { tag: "int" } }, // d
            { ty: { tag: "int" } }, // i
            { ty: { tag: "int" } }, // y
            { ty: { tag: "int" } }, // z
        ],
        blocks: new Map<number, msr.Block>([
            [0, {
                id: 0,
                stmts: [
                    pushInt(1),
                    storeLocal(i),
                ],
                ter: { kind: { tag: "jmp", target: 1 } },
            }],
            [1, {
                id: 1,
                stmts: [
                    pushInt(0),
                    storeLocal(a),
                    pushInt(0),
                    storeLocal(c),
                    pushInt(0),
                ],
                ter: { kind: { tag: "if", truthy: 2, falsy: 5 } },
            }],
            [2, {
                id: 2,
                stmts: [
                    pushInt(0),
                    storeLocal(a),
                    pushInt(0),
                    storeLocal(c),
                    pushInt(0),
                ],
                ter: { kind: { tag: "jmp", target: 3 } },
            }],
            [3, {
                id: 3,
                stmts: [
                    loadLocal(a),
                    loadLocal(b),
                    { kind: { tag: "add", ty: { tag: "int" } } },
                    storeLocal(y),
                    loadLocal(c),
                    loadLocal(d),
                    { kind: { tag: "add", ty: { tag: "int" } } },
                    storeLocal(z),
                    loadLocal(i),
                    pushInt(0),
                    { kind: { tag: "add", ty: { tag: "int" } } },
                    storeLocal(i),
                    pushInt(0),
                ],
                ter: { kind: { tag: "if", truthy: 1, falsy: 4 } },
            }],
            [4, {
                id: 4,
                stmts: [],
                ter: { kind: { tag: "return" } },
            }],
            [5, {
                id: 5,
                stmts: [
                    pushInt(0),
                    storeLocal(a),
                    pushInt(0),
                    storeLocal(d),
                    pushInt(0),
                ],
                ter: { kind: { tag: "if", truthy: 6, falsy: 8 } },
            }],
            [6, {
                id: 6,
                stmts: [
                    pushInt(0),
                    storeLocal(d),
                ],
                ter: { kind: { tag: "jmp", target: 7 } },
            }],
            [7, {
                id: 7,
                stmts: [
                    pushInt(0),
                    storeLocal(b),
                ],
                ter: { kind: { tag: "jmp", target: 3 } },
            }],
            [8, {
                id: 8,
                stmts: [
                    pushInt(0),
                    storeLocal(b),
                ],
                ter: { kind: { tag: "jmp", target: 7 } },
            }],
        ]),
        entry: 0,
        exit: 4,
        returnLocal: 0,
        paramLocals: [],
    }];
}

function exampleProgram(): msr.Fn[] {
    const pushIntStmt = (val: number): msr.Stmt => ({
        kind: { tag: "push", val: { tag: "int", val }, ty: { tag: "int" } },
    });
    return [{
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
                stmts: [
                    pushIntStmt(1),
                    { kind: { tag: "store_local", local: 0 } },
                ],
                ter: { kind: { tag: "jmp", target: 1 } },
            }],
            [1, {
                id: 1,
                stmts: [
                    { kind: { tag: "load_local", local: 0 } },
                ],
                ter: { kind: { tag: "if", truthy: 2, falsy: 3 } },
            }],
            [2, {
                id: 2,
                stmts: [
                    pushIntStmt(0),
                    { kind: { tag: "store_local", local: 1 } },
                ],
                ter: { kind: { tag: "jmp", target: 3 } },
            }],
            [3, {
                id: 3,
                stmts: [
                    { kind: { tag: "load_local", local: 1 } },
                    { kind: { tag: "load_local", local: 0 } },
                    { kind: { tag: "add", ty: { tag: "int" } } },
                    { kind: { tag: "store_local", local: 1 } },
                    { kind: { tag: "load_local", local: 0 } },
                    pushIntStmt(0),
                    { kind: { tag: "add", ty: { tag: "int" } } },
                    { kind: { tag: "store_local", local: 0 } },
                    { kind: { tag: "load_local", local: 0 } },
                ],
                ter: { kind: { tag: "if", truthy: 1, falsy: 4 } },
            }],
            [4, {
                id: 4,
                stmts: [
                    { kind: { tag: "load_local", local: 1 } },
                    { kind: { tag: "store_local", local: 2 } },
                ],
                ter: { kind: { tag: "return" } },
            }],
        ]),
        entry: 0,
        exit: 4,
        returnLocal: 0,
        paramLocals: [],
    }];
}

main();

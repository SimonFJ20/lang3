import * as ast from "./ast.ts";
import { AstToMsrLowerer } from "./ast_to_msr.ts";
import { Checker, Parser, Resolver } from "./front.ts";
import * as yaml from "jsr:@std/yaml";
import { MsrStringifyer } from "./msr.ts";
import { optimizeMsr } from "./optimize_msr.ts";

async function main() {
    const text = await Deno.readTextFile(Deno.args[0]);
    const ast = new Parser(text).parse();
    const re = new Resolver(ast).resolve();
    const ch = new Checker(re);

    //console.log(yaml.stringify(ast));
    //
    const lowerer = new AstToMsrLowerer(ast, re, ch);
    const msr = lowerer.lower();

    const msrStr = new MsrStringifyer();
    console.log(msr.map((fn) => msrStr.fn(fn)).join("\n"));

    console.log("\n=== AFTER OPTIMIZATION ===\n");
    optimizeMsr(msr);
    console.log(msr.map((fn) => msrStr.fn(fn)).join("\n"));
}

main();

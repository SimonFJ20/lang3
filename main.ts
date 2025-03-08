import * as ast from "./ast.ts";
import { Checker, Parser, Resolver } from "./front.ts";
import * as yaml from "jsr:@std/yaml";

async function main() {
    const text = await Deno.readTextFile(Deno.args[0]);
    const ast = new Parser(text).parse();
    const re = new Resolver(ast).resolve();
    const ch = new Checker(re);

    console.log(yaml.stringify(ast, {}));
}

main();

import { Block, BlockId, Fn, Stmt, Ter, Val } from "./msr.ts";
import { msrBlockTargets } from "./optimize_msr.ts";
import { Ty, tyToString } from "./ty.ts";

export class MsrStringifyer {
    public fn(fn: Fn): string {
        return `fn ${fn.ident}(${
            fn.paramLocals.map((i) => `%${i}`).join(", ")
        }) {\n${
            fn.locals
                .map((local, i) =>
                    `    %${i}: ${this.ty(local.ty)}${
                        i === fn.returnLocal
                            ? " // return"
                            : fn.paramLocals.includes(i)
                            ? " // param"
                            : ""
                    }\n`
                )
                .join("")
        }\n${
            fn.blocks
                .values()
                .toArray()
                .map((block) =>
                    `${
                        block.id === fn.entry
                            ? "    // entry\n"
                            : ""
                    }    .b${block.id} {\n${
                        block.stmts
                            .map((stmt) => `        ${this.stmt(stmt)}\n`)
                            .join("")
                    }        ${
                        block.ter ? this.ter(block.ter) : "<no terminator>"
                    }\n    }\n`
                )
                .join("")
        }}`;
    }

    public stmt(stmt: Stmt): string {
        const k = stmt.kind;
        switch (k.tag) {
            case "error":
                return "error";
            case "push":
                return `push ${this.ty(k.ty)} ${this.val(k.val)}`;
            case "pop":
                return "pop";
            case "lt":
            case "eq":
            case "add":
            case "mul":
                return `${k.tag} ${this.ty(k.ty)}`;
            case "load_local":
                return `local_local %${k.local}`;
            case "store_local":
                return `store_local %${k.local}`;
            case "call":
                return `call ${k.args}`;
        }
    }

    public ter(ter: Ter): string {
        const k = ter.kind;
        switch (k.tag) {
            case "error":
                return "error";
            case "return":
                return "return";
            case "jmp":
                return `jmp .b${k.target}`;
            case "if":
                return `if .b${k.truthy} else .b${k.falsy}`;
        }
    }

    public val(val: Val): string {
        switch (val.tag) {
            case "int":
                return `${val.val}`;
            case "fn": {
                //const k = val.stmt.kind;
                //if (k.tag !== "fn") {
                //    throw new Error();
                //}
                //return `fn ${k.ident}`;
                return "";
            }
        }
    }

    public ty(ty: Ty): string {
        return tyToString(ty);
    }
}

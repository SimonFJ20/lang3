import * as ast from "./ast.ts";
import { Ty, tyToString } from "./ty.ts";

export type Fn = {
    stmt: ast.Stmt;
    blocks: Block[];
    locals: Local[];

    entry: BlockId;
    returnLocal: number;
    paramLocals: number[];
};

export type BlockId = number;

export type Block = {
    id: BlockId;
    line: number;
    stmts: Stmt[];
    ter?: Ter;
};

export type Local = {
    ty: Ty;
};

export type Stmt = {
    line: number;
    kind: StmtKind;
};

export type StmtKind =
    | { tag: "error" }
    | { tag: "push"; val: Val; ty: Ty }
    | { tag: "pop" }
    | { tag: "lt" | "eq" | "add" | "mul"; ty: Ty }
    | { tag: "load_local"; local: number }
    | { tag: "store_local"; local: number }
    | { tag: "call"; args: number };

export type Ter = {
    line: number;
    kind: TerKind;
};

export type TerKind =
    | { tag: "error" }
    | { tag: "return" }
    | { tag: "jmp"; target: BlockId }
    | { tag: "if"; truthy: BlockId; falsy: BlockId };

export type Val =
    | { tag: "int"; val: number }
    | { tag: "fn"; stmt: ast.Stmt };

export class MsrStringifyer {
    public fn(fn: Fn): string {
        const k = fn.stmt.kind;
        if (k.tag !== "fn") {
            throw new Error();
        }
        return `fn ${k.ident}(${
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

import * as msr from "./msr.ts";
import * as ast from "./ast.ts";
import { Ty } from "./ty.ts";

export type Fn = {
    msrFn: msr.Fn;

    blocks: Block[];
    locals: Local[];

    entry: BlockId;
    exit: BlockId;
    returnLocal: number;
    paramLocals: number[];
};

export type BlockId = number;

export type Block = {
    id: BlockId;
    stmts: Stmt[];
    ter?: Ter;
};

export type Local = {
    ty: Ty;
    astStmt?: ast.Stmt;
};

export type Stmt = {
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

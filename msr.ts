import * as ast from "./ast.ts";
import { Ty } from "./ty.ts";

export type Fn = {
    blocks: Block[];
    locals: Local[];
};

export type Block = {
    line: number;
    stmts: Stmt[];
    ter: Ter;
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
    | { tag: "store_local"; local: number };

export type Ter = {
    line: number;
    kind: TerKind;
};

export type TerKind =
    | { tag: "error" }
    | { tag: "return" }
    | { tag: "jmp"; target: number }
    | { tag: "if"; truthy: number; falsy: number };

export type Val =
    | { tag: "int"; val: number }
    | { tag: "fn"; stmt: ast.Stmt };

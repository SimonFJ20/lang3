export type Block = {
    lineEntry: number;
    lineExit: number;
    stmts: Stmt[];
};

export type Stmt = {
    id: number;
    line: number;
    kind: StmtKind;
};

export type StmtKind =
    | { tag: "error" }
    | { tag: "fn" } & FnStmt
    | { tag: "let"; ident: string; expr: Expr }
    | { tag: "loop"; body: Block }
    | { tag: "if"; expr: Expr; truthy: Block; falsy?: Block }
    | { tag: "return"; expr?: Expr }
    | { tag: "break" }
    | { tag: "assign"; subject: Expr; expr: Expr }
    | { tag: "expr"; expr: Expr };

export type FnStmt = { ident: string; params: string[]; body: Block };

export type Expr = {
    id: number;
    line: number;
    kind: ExprKind;
};

export type ExprKind =
    | { tag: "error" }
    | { tag: "ident"; ident: string }
    | { tag: "int"; val: number }
    | { tag: "call"; expr: Expr; args: Expr[] }
    | { tag: "binary"; op: BinaryOp; left: Expr; right: Expr };

export type BinaryOp = "<" | "==" | "+" | "*";

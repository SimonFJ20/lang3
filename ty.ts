import * as ast from "./ast.ts";

export type Ty =
    | { tag: "error" }
    | { tag: "int" }
    | { tag: "fn"; stmt: ast.Stmt; params: Ty[]; returnTy: Ty };

export function tyToString(ty: Ty): string {
    switch (ty.tag) {
        case "error":
            return `<error>`;
        case "int":
            return `int`;
        case "fn": {
            const k = ty.stmt.kind as ast.StmtKind & { tag: "fn" };
            const params = ty.params
                .map((param, i) => `${k.params[i]}: ${tyToString(param)}`)
                .join(", ");
            const returnTy = tyToString(ty.returnTy);
            return `fn ${k.ident}(${params}) -> ${returnTy}`;
        }
    }
}

import { Block, BlockId, Fn } from "./msr.ts";
import { MsrStringifyer } from "./msr_stringifyer.ts";

export function optimizeMsr(msr: Fn[]) {
    const msrStr = new MsrStringifyer();

    for (const fn of msr) {
        console.log(`\noptimizing ${fn.ident}`);
        //new EliminateBlocks(fn).pass();

        const liveInfo = new LiveInfo(fn);
        liveInfo.gatherInitialInfo();
        liveInfo.solveLiveOut();
        console.log(liveInfo.toString());

        console.log(msrStr.fn(fn));
    }
    console.log("");
}

class LiveInfo {
    // varibles defined in block
    private varkillSets = new Map<BlockId, Set<number>>();
    // variables upwardly-exposed in block
    private uevarSets = new Map<BlockId, Set<number>>();

    private liveoutSets = new Map<BlockId, Set<number>>();

    public constructor(
        private fn: Fn,
    ) {}

    public gatherInitialInfo() {
        {
            const id = -1;
            this.varkillSets.set(id, new Set());
            this.uevarSets.set(id, new Set());
        }
        for (const [id, block] of this.fn.blocks) {
            this.varkillSets.set(id, new Set());
            this.uevarSets.set(id, new Set());

            const varkill = this.varkillSets.get(id)!;
            const uevar = this.uevarSets.get(id)!;

            msrVisitBlockLocals({
                block,
                sourceVisitor: (local) => {
                    if (!varkill.has(local)) {
                        uevar.add(local);
                    }
                },
                destVisitor: (local) => {
                    varkill.add(local);
                },
            });
        }
    }

    public solveLiveOut() {
        for (const [id, _block] of this.fn.blocks) {
            this.liveoutSets.set(id, new Set());
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const [id, _block] of this.fn.blocks) {
                const varkill = this.varkillSets.get(id)!;
                const uevar = this.uevarSets.get(id)!;
                const oldLiveout = this.liveoutSets.get(id)!;

                this.liveoutSets.set(
                    id,
                    uevar.union(oldLiveout.difference(varkill)),
                );

                if (this.liveoutSets.get(id)!.difference(oldLiveout).size > 0) {
                    changed = true;
                }
            }
        }
    }

    public toString(): string {
        return `varkill:\n${
            this.varkillSets
                .entries()
                .toArray()
                .map(([blockId, locals]) =>
                    `    .b${blockId}: ${
                        locals
                            .values()
                            .toArray()
                            .map((v) => `%${v}`)
                            .join(", ")
                    }\n`
                )
                .join("")
        }uevar:\n${
            this.uevarSets
                .entries()
                .toArray()
                .map(([blockId, locals]) =>
                    `    .b${blockId}: ${
                        locals
                            .values()
                            .toArray()
                            .map((v) => `%${v}`)
                            .join(", ")
                    }\n`
                )
                .join("")
        }liveout:\n${
            this.uevarSets
                .entries()
                .toArray()
                .map(([blockId, locals]) =>
                    `    .b${blockId}: ${
                        locals
                            .values()
                            .toArray()
                            .map((v) => `%${v}`)
                            .join(", ")
                    }\n`
                )
                .join("")
        }`;
    }
}

class EliminateBlocks {
    public constructor(
        private fn: Fn,
    ) {}

    public pass() {
        this.eliminateUnreach();
        this.eliminateBlocksWithOneToOneParent();
        this.eliminateEmptyBlocksWithSingleChild();
    }

    private eliminateUnreach() {
        const cands = this.fn.blocks
            .values()
            .reduce(
                (set, block) => (set.add(block.id), set),
                new Set<BlockId>(),
            );

        cands.delete(this.fn.entry);
        msrCfgForward(this.fn, (block) => {
            cands.delete(block.id);
        });

        for (const cand of cands.keys()) {
            this.fn.blocks.delete(cand);
        }
    }

    private eliminateBlocksWithOneToOneParent() {
        const cands = new Map<BlockId, BlockId>();
        const excempt = new Set<BlockId>();
        for (const block of this.fn.blocks.values()) {
            const targets = msrBlockTargets(block);
            if (
                targets.length === 0 || !targets.every((t) => t === targets[0])
            ) {
                continue;
            }
            const target = targets[0];
            if (excempt.has(target)) {
                continue;
            }
            if (cands.has(target)) {
                cands.delete(target);
                excempt.add(target);
                continue;
            }
            cands.set(target, block.id);
        }
        for (const [blockId, parentId] of cands) {
            const block = this.fn.blocks.get(blockId)!;
            const parent = this.fn.blocks.get(parentId)!;

            parent.stmts.push(...block.stmts);
            parent.ter = block.ter;
            this.fn.blocks.delete(block.id);
        }
    }

    private eliminateEmptyBlocksWithSingleChild() {
        const cands = new Map<BlockId, BlockId>();
        for (const block of this.fn.blocks.values()) {
            if (block.stmts.length !== 0) {
                continue;
            }
            const targets = msrBlockTargets(block);
            if (targets.length !== 1) {
                continue;
            }
            const target = targets[0];
            cands.set(block.id, target);
        }
        for (const [parent, block] of cands) {
            if (this.fn.entry === parent) {
                this.fn.entry = block;
            }
            this.fn.blocks.delete(parent);
        }
        for (const block of this.fn.blocks.values()) {
            msrVisitBlockTargets(block, (target) => {
                return cands.has(target) ? cands.get(target)! : target;
            });
        }
    }
}

export function msrCfgForward(fn: Fn, action: (block: Block) => void) {
    new MsrCfgForward(fn, action).pass();
}

class MsrCfgForward {
    private jumps = new Map<BlockId, Set<BlockId>>();

    public constructor(
        private fn: Fn,
        private action: (block: Block) => void,
    ) {}

    public pass() {
        this.visitBlock(this.fn.blocks.get(this.fn.entry)!);
    }

    private visitBlock(block: Block) {
        if (!this.jumps.has(block.id)) {
            this.jumps.set(block.id, new Set());
        }
        this.action(block);
        for (const id of msrBlockTargets(block)) {
            if (this.jumps.get(block.id)!.has(id)) {
                continue;
            }
            this.jumps.get(block.id)!.add(id);
            this.visitBlock(this.fn.blocks.get(id)!);
        }
    }
}

export function msrVisitBlockLocals(
    { block, sourceVisitor, destVisitor }: {
        block: Block;
        sourceVisitor: (local: number) => number | void;
        destVisitor: (local: number) => number | void;
    },
) {
    for (const stmt of block.stmts) {
        switch (stmt.kind.tag) {
            case "error":
            case "push":
            case "pop":
            case "lt":
            case "eq":
            case "add":
            case "mul":
                break;
            case "load_local":
                sourceVisitor(stmt.kind.local);
                break;
            case "store_local":
                destVisitor(stmt.kind.local);
                break;
            case "call":
                break;
        }
    }
    switch (block.ter!.kind.tag) {
        case "error":
            break;
        case "return":
            break;
        case "jmp":
            break;
        case "if":
            break;
    }
}

export function msrVisitBlockTargets(
    block: Block,
    visitor: (target: BlockId) => BlockId | void,
) {
    switch (block.ter!.kind.tag) {
        case "error":
            break;
        case "return":
            break;
        case "jmp":
            block.ter!.kind.target = visitor(block.ter!.kind.target) ??
                block.ter!.kind.target;
            break;
        case "if":
            block.ter!.kind.truthy = visitor(block.ter!.kind.truthy) ??
                block.ter!.kind.truthy;
            block.ter!.kind.falsy = visitor(block.ter!.kind.falsy) ??
                block.ter!.kind.falsy;
            break;
    }
}

export function msrBlockTargets(
    block: Block,
): BlockId[] {
    switch (block.ter!.kind.tag) {
        case "error":
            return [];
        case "return":
            return [];
        case "jmp":
            return [block.ter!.kind.target];
        case "if":
            return [block.ter!.kind.truthy, block.ter!.kind.falsy];
    }
}

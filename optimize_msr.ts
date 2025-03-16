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
        const domInfo = new DomInfo(fn);
        domInfo.solveDom();
        console.log(domInfo.toString());

        const unitialized = usesOfUninitializedLocals(fn, liveInfo);
        if (unitialized.size !== 0) {
            for (const local of unitialized) {
                const stmt = fn.locals[local].astStmt!;
                if (!stmt || stmt.kind.tag !== "let") {
                    continue;
                }
                console.log(
                    `variable ${stmt.kind.ident} used before initialization`,
                );
            }
        }

        const po = msrCfgPO(fn);
        const rpo = msrCfgRPO(fn, po);
        console.log({ po, rpo });
        console.log(msrStr.fn(fn));
    }
    console.log("");
}

class DomInfo {
    private domSets = new Map<BlockId, Set<BlockId>>();
    private preds: CfgPreds;

    public constructor(
        private fn: Fn,
    ) {
        this.preds = new CfgPreds(this.fn);
    }

    public dom(block: Block) {
        return this.domSets.get(block.id)!;
    }

    public solveDom() {
        const order = msrCfgRPO(this.fn);
        // const order = this.fn.blocks.keys().toArray();

        this.domSets.set(this.fn.entry, new Set([this.fn.entry]));
        for (const block of this.fn.blocks.values()) {
            if (block.id === this.fn.entry) {
                continue;
            }
            this.domSets.set(block.id, new Set(this.fn.blocks.keys()));
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const i of order) {
                if (i === this.fn.entry) {
                    continue;
                }
                const oldDom = this.domSets.get(i)!;
                const newDom = new Set([i]).union(
                    new Set(
                        this.preds
                            .pred(i)
                            .map((j) => this.domSets.get(j)!)
                            .reduce(
                                (acc, v) => acc.intersection(v),
                                new Set(this.fn.blocks.keys()),
                            ),
                    ),
                );
                if (
                    newDom.size !== oldDom.size ||
                    newDom.union(oldDom).size !== newDom.size
                ) {
                    this.domSets.set(i, newDom);
                    changed = true;
                }
            }
        }
    }

    public toString() {
        return `dom:\n${
            this.domSets
                .entries()
                .toArray()
                .map(([block, doms]) =>
                    `    .b${block}: ${
                        doms
                            .values()
                            .toArray()
                            .map((b) => `.b${b}`)
                            .join(", ")
                    }\n`
                ).join("")
        }`;
    }
}

function usesOfUninitializedLocals(fn: Fn, liveInfo: LiveInfo): Set<number> {
    const uevar = liveInfo.uevar(fn.entry);
    const liveout = liveInfo.liveout(fn.entry);
    const varkill = liveInfo.varkill(fn.entry);
    return uevar.union(liveout.difference(varkill));
}

class LiveInfo {
    // variables defined in block
    private varkillSets = new Map<BlockId, Set<number>>();
    // variables upwardly-exposed in block
    private uevarSets = new Map<BlockId, Set<number>>();

    private liveoutSets = new Map<BlockId, Set<number>>();

    public constructor(
        private fn: Fn,
    ) {}

    public varkill(id: BlockId): Set<number> {
        return this.varkillSets.get(id)!;
    }
    public uevar(id: BlockId): Set<number> {
        return this.uevarSets.get(id)!;
    }
    public liveout(id: BlockId): Set<number> {
        return this.liveoutSets.get(id)!;
    }

    public gatherInitialInfo() {
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
        const order = msrCfgReverseRPO(this.fn);
        // const order = this.fn.blocks.keys().toArray();

        for (const [i, _block] of this.fn.blocks) {
            this.liveoutSets.set(i, new Set());
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const i of order) {
                const newLiveoutSets: Set<number>[] = [];

                const nSucc = cfgSucc(this.fn.blocks.get(i)!);
                for (const m of nSucc) {
                    const mLiveout = this.liveoutSets.get(m)!;
                    const mVarkill = this.varkillSets.get(m)!;
                    const mUevar = this.uevarSets.get(m)!;

                    newLiveoutSets.push(
                        mUevar.union(mLiveout.difference(mVarkill)),
                    );
                }

                const oldLiveoutSet = this.liveoutSets.get(i)!;
                const newLiveoutSet = newLiveoutSets
                    .reduce((acc, set) => acc.union(set), new Set());

                if (
                    newLiveoutSet.size !== oldLiveoutSet.size ||
                    newLiveoutSet.union(oldLiveoutSet).size !==
                        newLiveoutSet.size
                ) {
                    changed = true;
                    this.liveoutSets.set(i, newLiveoutSet);
                }
            }
        }
    }

    public toString(): string {
        return `${
            ([
                [this.varkillSets, "varkill"],
                [this.uevarSets, "uevar"],
                [this.liveoutSets, "liveout"],
            ] as const)
                .map(([set, name]) =>
                    `${name}:\n${
                        set.entries()
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
                    }`
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
        cfgForward(this.fn, (block) => {
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
export function msrCfgReverseRPO(fn: Fn, po = msrCfgReversePO(fn)): BlockId[] {
    return po.toReversed();
}

export function msrCfgReversePO(fn: Fn): BlockId[] {
    const preds = new CfgPreds(fn);
    const ids: BlockId[] = [];
    new MsrCfgPostOrder(
        fn,
        (block) => {
            ids.push(block.id);
        },
        (block: Block) => preds.pred(block.id),
        preds.last(),
    ).pass();
    return ids;
}

export function msrCfgRPO(fn: Fn, po = msrCfgPO(fn)): BlockId[] {
    return po.toReversed();
}

export function msrCfgPO(fn: Fn): BlockId[] {
    const ids: BlockId[] = [];
    new MsrCfgPostOrder(fn, (block) => {
        ids.push(block.id);
    }).pass();
    return ids;
}

class MsrCfgPostOrder {
    private blocks = new Set<BlockId>();

    public constructor(
        private fn: Fn,
        private action: (block: Block) => void,
        private nextBlocks = msrBlockTargets,
        private entry = fn.entry,
    ) {}

    public pass() {
        this.visitBlock(this.fn.blocks.get(this.entry)!);
    }

    private visitBlock(block: Block) {
        if (this.blocks.has(block.id)) {
            return;
        }
        this.blocks.add(block.id);
        for (const id of this.nextBlocks(block)) {
            this.visitBlock(this.fn.blocks.get(id)!);
        }
        this.action(block);
    }
}

export class CfgPreds {
    private predSets = new Map<BlockId, number[]>();
    private lastId!: BlockId;

    public constructor(
        private fn: Fn,
    ) {
        this.calculatePreds();
    }

    private calculatePreds() {
        for (const [id, _] of this.fn.blocks) {
            this.predSets.set(id, []);
        }
        for (const [id, block] of this.fn.blocks) {
            const succs = cfgSucc(block);
            if (succs.length === 0) {
                this.lastId = id;
            }
            for (const succ of succs) {
                this.predSets.get(succ)!.push(id);
            }
        }
    }

    public pred(id: BlockId): BlockId[] {
        return this.predSets.get(id)!;
    }

    public last(): BlockId {
        return this.lastId;
    }
}

export function cfgSucc(block: Block): BlockId[] {
    const k = block.ter!.kind;
    switch (k.tag) {
        case "error":
            return [];
        case "return":
            return [];
        case "jmp":
            return [k.target];
        case "if":
            return [k.truthy, k.falsy];
    }
}

export function cfgForward(fn: Fn, action: (block: Block) => void) {
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

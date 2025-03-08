import { Block, BlockId, Fn } from "./msr.ts";

export function optimizeMsr(msr: Fn[]) {
    for (const fn of msr) {
        new EliminateBlocks(fn).pass();
    }
}

class EliminateBlocks {
    public constructor(
        private fn: Fn,
    ) {}

    public pass() {
        //this.eliminateUnreachableBlocks();
        //this.eliminateTrivialBlocks();
        //this.eliminateTrivialBlocks2();
    }

    private eliminateUnreachableBlocks() {
        const unreachableBlocks = this.fn.blocks
            .reduce((map, block, i) => {
                map.set(block.id, { i, block });
                return map;
            }, new Map<number, { i: number; block: Block }>());

        unreachableBlocks.delete(this.fn.entry);
        for (const block of this.fn.blocks) {
            const targets = terTargets(block);
            for (const target of targets) {
                console.log({ target });
                unreachableBlocks.delete(target);
            }
        }

        for (const { i } of unreachableBlocks.values()) {
            this.fn.blocks.splice(i, 1);
        }
    }

    private eliminateTrivialBlocks() {
        const blocks = this.fn.blocks
            .reduce((map, block, i) => {
                map.set(block.id, { i, block });
                return map;
            }, new Map<number, { i: number; block: Block }>());

        const oneToOneJumps: { origin: Block; target: Block }[] = [];

        for (const block of this.fn.blocks) {
            const targets = terTargets(block);
            if (
                targets.length === 0 ||
                !targets.every((target) => target === targets[0])
            ) {
                continue;
            }

            const existing = oneToOneJumps
                .findIndex(({ target }) => target.id === targets[0]);
            if (existing !== -1) {
                oneToOneJumps.splice(existing, 1);
                continue;
            }

            oneToOneJumps.push({
                origin: block,
                target: blocks.get(targets[0])!.block,
            });
        }

        for (const { origin, target } of oneToOneJumps.toReversed()) {
            origin.stmts.push(...target.stmts);
            origin.ter = target.ter;
            const i = blocks.get(target.id)!.i;
            this.fn.blocks.splice(i, 1);
        }
    }

    private eliminateTrivialBlocks2() {
        const blocks = this.fn.blocks
            .reduce((map, block, i) => {
                map.set(block.id, { i, block });
                return map;
            }, new Map<number, { i: number; block: Block }>());

        const candidates: { block: Block; comeFrom: Block }[] = [];

        for (const comeFrom of this.fn.blocks) {
            const targets = terTargets(comeFrom);
            if (
                targets.length === 0 ||
                !targets.every((target) => target === targets[0])
            ) {
                continue;
            }

            const exists = candidates.findIndex((cand) =>
                cand.block.id === targets[0]
            );
            if (exists !== -1) {
                candidates.splice(exists, 1);
                continue;
            }

            if (blocks.get(targets[0])!.block.stmts.length !== 0) {
                continue;
            }

            candidates.push({ block: blocks.get(targets[0])!.block, comeFrom });
        }

        for (const cand of candidates.toReversed()) {
            cand.comeFrom.ter = cand.block.ter;
            const i = blocks.get(cand.block.id)!.i;
            this.fn.blocks.splice(i, 1);
        }
    }
}

function terTargets(
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

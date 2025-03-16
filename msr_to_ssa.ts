import * as msr from "./msr.ts";
import { BlockId, Fn } from "./ssa.ts";

export class MsrToSsaLowerer {
    public constructor(
        private msr: msr.Fn[],
    ) {}

    public lower(): Fn {
        throw new Error();
    }
}

class FnLowerer {
    public constructor(
        private fn: msr.Fn,
    ) {}
}

class Dfa {
    private blocks: msr.Block[];

    public constructor(
        private fn: msr.Fn,
    ) {
        this.blocks = fn.blocks.values().toArray();
    }
}

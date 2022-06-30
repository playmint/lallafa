export type DebugTraceLog = {
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
};

export type DebugTrace = {
    gas: number;
    failed: boolean;
    returnValue: string;
    structLogs: DebugTraceLog[];
};

export function profile(trace: DebugTrace) {
    // TODO remove this
    let totalGas = 0;
    for (const log of trace.structLogs) {
        totalGas += log.gasCost;
    }
    if (trace.gas != totalGas) {
        throw "gas doesn't match totalgas";
    }

    const gasPerPC: { [pc: number]: number } = {};
    const gasPerLine: { [line: number]: number } = {};
    for (const log of trace.structLogs) {
        if (!gasPerPC[log.pc]) {
            gasPerPC[log.pc] = 0;
        }
        gasPerPC[log.pc] += log.gasCost;

        const line = getLineForPC(log.pc);
        if (!gasPerLine[line]) {
            gasPerLine[line] = 0;
        }
        gasPerLine[line] += log.gasCost;
    }
}
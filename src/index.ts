export type DebugTrace = {
    gas: number;
    failed: boolean;
    returnValue: string;
    structLogs: DebugTraceLog[];
};

export type DebugTraceLog = {
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
};

export type CompilerOutput = {
    bytecode: ContractBytecode;
    deployedBytecode: ContractBytecode;
    sources: { [source: string]: { id: number } }
};

export type ContractBytecode = {
    bytecode: string;
    sourceMap: string;
    generatedSources: GeneratedSource[];
};

export type GeneratedSource = {
    id: number;
    name: string;
    contents: string;
};

export function profile(trace: DebugTrace, compilerOutput: CompilerOutput, inputSources: { sources: { [name: string]: { content: string } } }) {
    // TODO remove this
    let totalGas = 0;
    for (const log of trace.structLogs) {
        totalGas += log.gasCost;
    }
    if (trace.gas != totalGas) {
        throw "gas doesn't match totalgas";
    }

    const pcToInstruction = parseBytecode(compilerOutput.deployedBytecode.bytecode);
    const sourceMap = parseSourceMap(compilerOutput.deployedBytecode.sourceMap);

    const sources: { [id: number]: string[] } = {};
    for (const sourceName in compilerOutput.sources) {
        const sourceId = compilerOutput.sources[sourceName].id;
        const content = inputSources.sources[sourceName].content;
        sources[sourceId] = content.split("\n");
    }
    for (const generatedSource of compilerOutput.deployedBytecode.generatedSources) {
        sources[generatedSource.id] = generatedSource.contents.split("\n");
    }

    const instructionToSourceLine: number[] = [];
    function findSourceLine(sourceId: number, offset: number) {
        const lines = sources[sourceId];
        let totalChars = 0;
        for (let i = 0; i < lines.length; ++i) {
            totalChars += lines[i].length + 1;
            if (offset < totalChars) {
                return i;
            }
        }

        return -1;
    }
    for (let i = 0; i < sourceMap.length; ++i) {
        instructionToSourceLine.push(findSourceLine(sourceMap[i].sourceId, sourceMap[i].rangeStart));
    }

    const gasPerPC: { [pc: number]: number } = {};
    const gasPerSource: { [source: number]: { [line: number]: number } } = {};
    for (const log of trace.structLogs) {
        if (!gasPerPC[log.pc]) {
            gasPerPC[log.pc] = 0;
        }
        gasPerPC[log.pc] += log.gasCost;

        // TODO throw if we can't map pc back to instruction, or an entry in source map, etc
        const instructionId = pcToInstruction[log.pc];
        const sourceMapEntry = sourceMap[instructionId];

        if (!gasPerSource[sourceMapEntry.sourceId]) {
            gasPerSource[sourceMapEntry.sourceId] = {};
        }

        const line = instructionToSourceLine[instructionId];
        if (!gasPerSource[sourceMapEntry.sourceId][line]) {
            gasPerSource[sourceMapEntry.sourceId][line] = 0;
        }
        gasPerSource[sourceMapEntry.sourceId][line] += log.gasCost;
    }
}

// TODO remove export where uneccessary
export type SourceMapEntry = {
    rangeStart: number;
    rangeLength: number;
    sourceId: number;
    jump: Jump;
    modifierDepth: number;
}

export type Jump = "in" | "out" | "-";

function parseSourceMap(sourceMap: string) {
    const entries: SourceMapEntry[] = [];
    const entry: SourceMapEntry = {
        rangeStart: -1,
        rangeLength: -1,
        sourceId: -1,
        jump: "-",
        modifierDepth: -1
    };

    function updateEntryNumber(entrySplit: string[], index: number, current: number) {
        if (index < entrySplit.length && entrySplit[index] != "") {
            return parseInt(entrySplit[index]);
        }
        return current;
    }

    for (const entryStr of sourceMap.split(";")) {
        if (entryStr != "") {
            const entrySplit = entryStr.split(":");

            entry.rangeStart = updateEntryNumber(entrySplit, 0, entry.rangeStart);
            entry.rangeLength = updateEntryNumber(entrySplit, 1, entry.rangeLength);
            entry.sourceId = updateEntryNumber(entrySplit, 2, entry.sourceId);
            entry.rangeStart = updateEntryNumber(entrySplit, 4, entry.rangeStart);

            if (entrySplit.length > 3 && entrySplit[3] != "") {
                entry.jump = entrySplit[3] as Jump;
            }
        }

        entries.push(entry);
    }

    return entries;
}

function parseBytecode(bytecode: string) {
    const pcToInstruction: { [pc: number]: number } = {};
    let i = 0;
    let currentInstruction = 0;
    while (i < bytecode.length) {
        const pc = i / 2;
        pcToInstruction[pc] = currentInstruction;

        const opcode = parseInt(bytecode.substring(i, i + 2), 16);

        if (opcode >= 0x60 && opcode <= 0x7F) {
            // PUSHX opcodes are followed by 1+ bytes
            const byteCount = opcode - 0x5F;
            i += (byteCount * 2);
        }

        i += 2;
        ++currentInstruction;
    }

    return pcToInstruction;
}
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

export type InstructionsProfile = {
    gas: number;
    bytecode: string;
    asm: string;
    pc: number;
}[];

export type SourcesProfile = {
    [source: number]: {
        name: string,
        lines: {
            gas: number,
            text: string
        }[]
    }
};

export function profile(trace: DebugTrace, compilerOutput: CompilerOutput, inputSources: { sources: { [name: string]: { content: string } } }) {
    // TODO get this to work with deployment txns too
    // TODO handle calls to other contracts etc
    const instructions = parseBytecode(compilerOutput.deployedBytecode.bytecode);
    const sourceMap = parseSourceMap(compilerOutput.deployedBytecode.sourceMap);

    const sourcesById: { [id: number]: { name: string, lines: string[] } } = {};
    for (const sourceName in compilerOutput.sources) {
        const sourceId = compilerOutput.sources[sourceName].id;
        sourcesById[sourceId] = {
            name: sourceName,
            lines: inputSources.sources[sourceName].content.split("\n")
        };
    }
    for (const generatedSource of compilerOutput.deployedBytecode.generatedSources) {
        sourcesById[generatedSource.id] = {
            name: generatedSource.name,
            lines: generatedSource.contents.split("\n")
        };
    }

    const instructionToSourceLine: number[] = [];
    function findSourceLine(sourceId: number, offset: number) {
        const lines = sourcesById[sourceId].lines;
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

    const instructionsProfile: InstructionsProfile = [];
    for (const instruction of instructions.instructions) {
        instructionsProfile.push({
            bytecode: "0x" + instruction.bytecode,
            asm: instruction.asm,
            pc: instruction.pc,
            gas: 0
        });
    }

    const sourcesProfile: SourcesProfile = {};
    for (const log of trace.structLogs) {
        // TODO throw if we can't map pc back to instruction, or an entry in source map, etc
        const instructionId = instructions.pcToInstructionId[log.pc];

        instructionsProfile[instructionId].gas += log.gasCost;

        const sourceMapEntry = sourceMap[instructionId];

        if (!sourcesProfile[sourceMapEntry.sourceId]) {
            sourcesProfile[sourceMapEntry.sourceId] = {
                name: sourcesById[sourceMapEntry.sourceId].name,
                lines: sourcesById[sourceMapEntry.sourceId].lines.map((line) => { return { text: line, gas: 0 }; })
            };
        }

        const line = instructionToSourceLine[instructionId];
        sourcesProfile[sourceMapEntry.sourceId].lines[line].gas += log.gasCost;
    }

    return {
        instructions: instructionsProfile,
        sources: sourcesProfile
    };
}

export function sourcesProfileToString(sourcesProfile: SourcesProfile) {
    let biggestGasNumber = 0;
    for (const sourceId in sourcesProfile) {
        for (const line of sourcesProfile[sourceId].lines) {
            biggestGasNumber = Math.max(biggestGasNumber, line.gas);
        }
    }
    const gasDigits = Math.floor(Math.log10(biggestGasNumber)) + 1;

    let str = "";
    for (const sourceId in sourcesProfile) {
        str += `// ${sourcesProfile[sourceId].name}\n\n`;
        for (const line of sourcesProfile[sourceId].lines) {
            str += `${line.gas.toString().padStart(gasDigits, "0")}\t${line.text}\n`;
        }
    }

    return str;
}

export function instructionsProfileToString(instructionsProfile: InstructionsProfile) {
    const biggestGasNumber = instructionsProfile.reduce(
        (biggest, instruction) => {
            return Math.max(biggest, instruction.gas);
        }, 0);
    const gasPad = Math.floor(Math.log10(biggestGasNumber)) + 1;

    const pcPad = Math.floor(Math.log10(instructionsProfile[instructionsProfile.length - 1].pc)) + 1;

    const asmPad = instructionsProfile.reduce(
        (longestAsmStr, instruction) => {
            return Math.max(longestAsmStr, instruction.asm.length)
        }, 0);

    let str = "";
    for (const instruction of instructionsProfile) {
        str += `${instruction.gas.toString().padEnd(gasPad, " ")}\t${instruction.pc.toString().padEnd(pcPad, " ")}\t${instruction.asm.toString().padEnd(asmPad, " ")}\t${instruction.bytecode}\n`;
    }

    return str;
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

        entries.push({ ...entry });
    }

    return entries;
}

function parseBytecode(bytecode: string) {
    const instructions: { bytecode: string, asm: string, pc: number }[] = [];
    const pcToInstructionId: { [pc: number]: number } = {};
    let i = 0;
    let currentInstruction = 0;
    while (i < bytecode.length) {
        const pc = i / 2;
        pcToInstructionId[pc] = currentInstruction;

        let instructionBytecode = bytecode.substring(i, i + 2).toUpperCase();
        const opcode = parseInt(instructionBytecode, 16);
        let asm = opcodes[opcode] ? opcodes[opcode] : "UNKNOWN";

        if (opcode >= 0x60 && opcode <= 0x7F) {
            // PUSHX opcodes are followed by 1+ bytes
            const byteCount = opcode - 0x5F;
            let bytes = bytecode.substring(i + 2, i + 2 + (byteCount * 2)).toUpperCase();
            instructionBytecode += bytes;
            while (bytes.length > 1 && bytes.startsWith("0")) {
                bytes = bytes.substring(1);
            }
            asm += " 0x" + bytes;

            i += (byteCount * 2);
        }

        instructions.push({
            bytecode: instructionBytecode,
            asm,
            pc
        });

        i += 2;
        ++currentInstruction;
    }

    return {
        instructions,
        pcToInstructionId
    }
}

const opcodes: { [opcode: number]: string } = {
    0x00: "STOP",
    0x01: "ADD",
    0x02: "MUL",
    0x03: "SUB",
    0x04: "DIV",
    0x05: "SDIV",
    0x06: "MOD",
    0x07: "SMOD",
    0x08: "ADDMOD",
    0x09: "MULMOD",
    0x0A: "EXP",
    0x0B: "SIGNEXTEND",
    0x10: "LT",
    0x11: "GT",
    0x12: "SLT",
    0x13: "SGT",
    0x14: "EQ",
    0x15: "ISZERO",
    0x16: "AND",
    0x17: "OR",
    0x18: "XOR",
    0x19: "NOT",
    0x1A: "BYTE",
    0x1B: "SHL",
    0x1C: "SHR",
    0x1D: "SAR",
    0x20: "SHA3",
    0x30: "ADDRESS",
    0x31: "BALANCE",
    0x32: "ORIGIN",
    0x33: "CALLER",
    0x34: "CALLVALUE",
    0x35: "CALLDATALOAD",
    0x36: "CALLDATASIZE",
    0x37: "CALLDATACOPY",
    0x38: "CODESIZE",
    0x39: "CODECOPY",
    0x3A: "GASPRICE",
    0x3B: "EXTCODESIZE",
    0x3C: "EXTCODECOPY",
    0x3D: "RETURNDATASIZE",
    0x3E: "RETURNDATACOPY",
    0x3F: "EXTCODEHASH",
    0x40: "BLOCKHASH",
    0x41: "COINBASE",
    0x42: "TIMESTAMP",
    0x43: "NUMBER",
    0x44: "DIFFICULTY",
    0x45: "GASLIMIT",
    0x46: "CHAINID",
    0x47: "SELFBALANCE",
    0x48: "BASEFEE",
    0x50: "POP",
    0x51: "MLOAD",
    0x52: "MSTORE",
    0x53: "MSTORE8",
    0x54: "SLOAD",
    0x55: "SSTORE",
    0x56: "JUMP",
    0x57: "JUMPI",
    0x58: "PC",
    0x59: "MSIZE",
    0x5A: "GAS",
    0x5B: "JUMPDEST",
    0x60: "PUSH1",
    0x61: "PUSH2",
    0x62: "PUSH3",
    0x63: "PUSH4",
    0x64: "PUSH5",
    0x65: "PUSH6",
    0x66: "PUSH7",
    0x67: "PUSH8",
    0x68: "PUSH9",
    0x69: "PUSH10",
    0x6A: "PUSH11",
    0x6B: "PUSH12",
    0x6C: "PUSH13",
    0x6D: "PUSH14",
    0x6E: "PUSH15",
    0x6F: "PUSH16",
    0x70: "PUSH17",
    0x71: "PUSH18",
    0x72: "PUSH19",
    0x73: "PUSH20",
    0x74: "PUSH21",
    0x75: "PUSH22",
    0x76: "PUSH23",
    0x77: "PUSH24",
    0x78: "PUSH25",
    0x79: "PUSH26",
    0x7A: "PUSH27",
    0x7B: "PUSH28",
    0x7C: "PUSH29",
    0x7D: "PUSH30",
    0x7E: "PUSH31",
    0x7F: "PUSH32",
    0x80: "DUP1",
    0x81: "DUP2",
    0x82: "DUP3",
    0x83: "DUP4",
    0x84: "DUP5",
    0x85: "DUP6",
    0x86: "DUP7",
    0x87: "DUP8",
    0x88: "DUP9",
    0x89: "DUP10",
    0x8A: "DUP11",
    0x8B: "DUP12",
    0x8C: "DUP13",
    0x8D: "DUP14",
    0x8E: "DUP15",
    0x8F: "DUP16",
    0x90: "SWAP1",
    0x91: "SWAP2",
    0x92: "SWAP3",
    0x93: "SWAP4",
    0x94: "SWAP5",
    0x95: "SWAP6",
    0x96: "SWAP7",
    0x97: "SWAP8",
    0x98: "SWAP9",
    0x99: "SWAP10",
    0x9A: "SWAP11",
    0x9B: "SWAP12",
    0x9C: "SWAP13",
    0x9D: "SWAP14",
    0x9E: "SWAP15",
    0x9F: "SWAP16",
    0xA0: "LOG0",
    0xA1: "LOG1",
    0xA2: "LOG2",
    0xA3: "LOG3",
    0xA4: "LOG4",
    0xF0: "CREATE",
    0xF1: "CALL",
    0xF2: "CALLCODE",
    0xF3: "RETURN",
    0xF4: "DELEGATECALL",
    0xF5: "CREATE2",
    0xFA: "STATICCALL",
    0xFD: "REVERT",
    0xFE: "INVALID",
    0xFF: "SELFDESTRUCT"
};
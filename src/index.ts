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
    stack?: string[];
};

export type ContractInfoMap = {
    [address: string]: ContractInfo;
};

export type ContractInfo = {
    output: CompilerOutput;
    input: {
        sources: { [name: string]: { content: string } }
    };
};

export type CompilerOutput = {
    bytecode: ContractBytecode;
    deployedBytecode: ContractBytecode;
    sources: { [source: string]: { id: number, ast: any } };
};

export type ContractBytecode = {
    bytecode: string;
    sourceMap: string;
    generatedSources: GeneratedSource[];
};

type GeneratedSource = {
    id: number;
    name: string;
    contents: string;
    ast: any;
};

export type InstructionsProfile = {
    gas: number;
    bytecode: string;
    asm: string;
    pc: number;
    op: string;
}[];

export type SourcesProfile = {
    [source: number]: {
        name: string;
        lines: {
            gas: number;
            text: string;
        }[];
    }
};

type AstNode = {
    src: string;
} & ({
    nodeType: "SourceUnit";
    nodes: AstNode[];
} | {
    nodeType: "FunctionDefinition";
    name: string;
    parameters: {
        nodeType: "ParameterList";
        parameters: AstFunctionParameter[];
    };
    nodes: AstNode[];
} | {
    nodeType: "YulBlock";
    statements: AstNode[];
} | {
    nodeType: "YulFunctionDefinition";
    name: string;
});

type AstFunctionParameter = {
    nodeType: "VariableDeclaration";
    typeName: {
        name: string;
    };
};

type SourceMapEntry = {
    rangeStart: number;
    rangeLength: number;
    sourceId: number;
    jump: Jump;
    modifierDepth: number;
}

type Jump = "in" | "out" | "-";

type ContractProfile = {
    sourcesProfile: SourcesProfile;
    instructionsProfile: InstructionsProfile;
    pcToInstructionId: { [pc: number]: number };
    sourceMap: SourceMapEntry[];
    sourcesById: SourcesById;
    instructionToSourceLine: number[];
};

type SourcesById = {
    [id: number]: {
        name: string;
        lines: string[];
        ast: AstNode
    }
};

type ContractProfiles = {
    [address: string]: ContractProfile;
};

export type Profile = {
    [address: string]: {
        instructionsProfile: InstructionsProfile;
        sourcesProfile: SourcesProfile;
    }
};

export function profile(trace: DebugTrace, isDeploymentTransaction: boolean, address: string, contracts: ContractInfoMap): Profile {
    const profiles: ContractProfiles = {};
    const profile = createProfileForContract(contracts[address], isDeploymentTransaction);
    profiles[address.toUpperCase()] = profile;

    let currentDepth = 1;
    for (let i = 0; i < trace.structLogs.length; ++i) {
        const log = trace.structLogs[i];

        if (currentDepth != log.depth) {
            if (log.depth > currentDepth) {
                const previousLog = trace.structLogs[i - 1];
                if (previousLog.stack) {
                    // call/callcode/staticcall/delegatecall all put gas at the top of the stack,
                    // and then the address of the contract being called
                    const address = "0x" + previousLog.stack[previousLog.stack.length - 2].substring(24).toUpperCase();
                    console.log("calling", address);
                }
            }

            currentDepth = log.depth;
        }
        if (log.depth > 1) {
            continue;
        }

        if (profile.pcToInstructionId[log.pc] === undefined) {
            throw new Error(`couldn't find instruction for PC ${log.pc}`);
        }
        const instructionId = profile.pcToInstructionId[log.pc];

        if (log.op != profile.instructionsProfile[instructionId].op) {
            throw new Error(`op in debug trace ${log.op} not same as instruction found in bytecode ${profile.instructionsProfile[instructionId].op}`);
        }

        profile.instructionsProfile[instructionId].gas += log.gasCost;

        const sourceMapEntry = profile.sourceMap[instructionId];

        // these are lazily created so we only output sources which contribute to gas usage for this txn
        if (!profile.sourcesProfile[sourceMapEntry.sourceId]) {
            profile.sourcesProfile[sourceMapEntry.sourceId] = {
                name: profile.sourcesById[sourceMapEntry.sourceId].name,
                lines: profile.sourcesById[sourceMapEntry.sourceId].lines.map((line) => { return { text: line, gas: 0 }; })
            };
        }

        const line = profile.instructionToSourceLine[instructionId];
        profile.sourcesProfile[sourceMapEntry.sourceId].lines[line].gas += log.gasCost;
    }

    const result: Profile = {};
    for (const address in profiles) {
        result[address] = {
            instructionsProfile: profiles[address].instructionsProfile,
            sourcesProfile: profiles[address].sourcesProfile
        };
    }

    return result;
}

export function sourcesProfileToString(profile: Profile) {
    let biggestGasNumber = 0;
    for (const address in profile) {
        const sourcesProfile = profile[address].sourcesProfile;
        for (const sourceId in sourcesProfile) {
            biggestGasNumber = sourcesProfile[sourceId].lines.reduce((biggest, line) => Math.max(biggest, line.gas), biggestGasNumber);
            for (const line of sourcesProfile[sourceId].lines) {
                biggestGasNumber = Math.max(biggestGasNumber, line.gas);
            }
        }
    }
    const gasPad = Math.floor(Math.log10(biggestGasNumber)) + 1;

    let str = "";
    for (const address in profile) {
        str += `// ${address}\n============================================\n`;
        const sourcesProfile = profile[address].sourcesProfile;
        for (const sourceId in sourcesProfile) {
            str += `\n// ${sourcesProfile[sourceId].name}\n\n`;
            for (const line of sourcesProfile[sourceId].lines) {
                str += `${line.gas.toString().padEnd(gasPad, " ")}\t${line.text}\n`;
            }
        }
    }

    return str;
}

export function instructionsProfileToString(profile: Profile) {
    const biggestGasNumber = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile.reduce(
            (biggest, instruction) => {
                return Math.max(biggest, instruction.gas);
            }, biggest));
    }, 0);
    const gasPad = Math.floor(Math.log10(biggestGasNumber)) + 1;

    const biggestPc = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile[contractProfile.instructionsProfile.length - 1].pc);
    }, 0);
    const pcPad = Math.floor(Math.log(biggestPc) / Math.log(16)) + 1;

    const asmPad = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile.reduce(
            (longestAsmStr, instruction) => Math.max(longestAsmStr, instruction.asm.length), biggest));
    }, 0);

    let str = "";
    for (const address in profile) {
        str += `// ${address}\n============================================\n\n`;
        const instructionsProfile = profile[address].instructionsProfile;
        for (const instruction of instructionsProfile) {
            str += `${instruction.gas.toString().padEnd(gasPad, " ")}\t${instruction.pc.toString(16).toUpperCase().padEnd(pcPad, " ")}\t${instruction.asm.toString().padEnd(asmPad, " ")}\t${instruction.bytecode}\n`;
        }
    }

    return str;
}

function createProfileForContract(contractInfo: ContractInfo, isDeployment: boolean = false): ContractProfile {
    const bytecode = isDeployment ? contractInfo.output.bytecode : contractInfo.output.deployedBytecode;

    // source maps refer to source ids, so create a lookup of source ids to
    // sources, both generated and non-generated
    const sourcesById: SourcesById = {};
    for (const sourceName in contractInfo.output.sources) {
        const sourceId = contractInfo.output.sources[sourceName].id;
        sourcesById[sourceId] = {
            name: sourceName,
            lines: contractInfo.input.sources[sourceName].content.split("\n"),
            ast: contractInfo.output.sources[sourceName].ast
        };
    }
    for (const generatedSource of bytecode.generatedSources) {
        sourcesById[generatedSource.id] = {
            name: generatedSource.name,
            lines: generatedSource.contents.split("\n"),
            ast: generatedSource.ast
        };
    }

    const sourceMap = parseSourceMap(bytecode.sourceMap);
    const instructions = parseBytecode(bytecode.bytecode, sourceMap.length);

    // generate human readable names for jumpdests
    const jumpDestNames: { [pc: number]: string } = {};
    const functionJumpDestCounts: { [sourceId: number]: { [functionSig: string]: number } } = {};
    for (let i = 0; i < instructions.instructions.length; ++i) {
        if (instructions.instructions[i].asm == "JUMPDEST") {
            const sourceMapEntry = sourceMap[i];
            const rangeStart = sourceMapEntry.rangeStart;
            const rangeEnd = sourceMapEntry.rangeStart + sourceMapEntry.rangeLength - 1;
            const ast = sourcesById[sourceMapEntry.sourceId].ast;

            // use function so we can be recursive
            function astFunctionSearch(ast: AstNode): AstNode | null {
                let childNodes: AstNode[] = [];
                if ("nodes" in ast) {
                    childNodes = ast.nodes;
                }
                else if ("statements" in ast) {
                    childNodes = ast.statements;
                }

                for (const node of childNodes) {
                    const srcSplit = node.src.split(":");
                    const nodeRangeStart = parseInt(srcSplit[0]);
                    const nodeRangeEnd = nodeRangeStart + parseInt(srcSplit[1]) - 1;

                    if (rangeStart >= nodeRangeStart && rangeEnd <= nodeRangeEnd) {
                        if (node.nodeType == "FunctionDefinition" ||
                            node.nodeType == "YulFunctionDefinition") {
                            return node;
                        }
                        return astFunctionSearch(node);
                    }
                }

                return null;
            }

            const functionNode = astFunctionSearch(ast);
            if (functionNode) {
                let functionSig = "";
                if (functionNode.nodeType == "FunctionDefinition") {
                    functionSig = `${functionNode.name}${functionNode.parameters.parameters.length > 0 ? `_${functionNode.parameters.parameters.map(param => param.typeName.name).join("_")}` : ""}`;
                }
                else if (functionNode.nodeType == "YulFunctionDefinition") {
                    functionSig = `${functionNode.name}`;
                }

                if (functionSig != "") {
                    // some functions can have multiple jumpdests within, so
                    // keep track of number of jumpdests per function so that
                    // each can have a unique name
                    if (!functionJumpDestCounts[sourceMapEntry.sourceId]) {
                        functionJumpDestCounts[sourceMapEntry.sourceId] = {};
                    }
                    if (!functionJumpDestCounts[sourceMapEntry.sourceId][functionSig]) {
                        functionJumpDestCounts[sourceMapEntry.sourceId][functionSig] = 0;
                    }

                    const jumpDestCount = functionJumpDestCounts[sourceMapEntry.sourceId][functionSig];
                    ++functionJumpDestCounts[sourceMapEntry.sourceId][functionSig];

                    const jumpDestName = `${functionSig}_${jumpDestCount}`;
                    jumpDestNames[instructions.instructions[i].pc] = jumpDestName;

                    instructions.instructions[i].asm += ` [${jumpDestName}]`;
                }
            }

        }
    }

    // generate human readable names for jumps
    for (let i = 0; i < instructions.instructions.length; ++i) {
        if (instructions.instructions[i].asm == "JUMP" ||
            instructions.instructions[i].asm == "JUMPI") {
            if (instructions.instructions[i - 1].asm.startsWith("PUSH")) {
                const bytes = instructions.instructions[i - 1].asm.split(" ")[1];
                const pc = parseInt(bytes.substring(2), 16);
                if (jumpDestNames[pc]) {
                    instructions.instructions[i - 1].asm += ` [${jumpDestNames[pc]}]`;
                }
                instructions.instructions[i].asm += " [in]";
            }
            else if (instructions.instructions[i - 1].asm == "POP") {
                instructions.instructions[i].asm += " [out]";
            }
        }
    }

    // each instruction in the source map will have a file offset, so use this
    // to figure out the actual line number in each file that the instruction
    // corresponds to. Cache this as may execute the same instruction many times
    const instructionToSourceLine: number[] = [];
    for (let instructionId = 0; instructionId < sourceMap.length; ++instructionId) {
        const sourceMapEntry = sourceMap[instructionId];
        const offset = sourceMapEntry.rangeStart;
        const lines = sourcesById[sourceMapEntry.sourceId].lines;
        let totalChars = 0;
        let line: number;
        for (line = 0; line < lines.length; ++line) {
            totalChars += lines[line].length + 1; // + 1 for the \n character which has been removed already
            if (offset < totalChars) {
                break;
            }
        }
        if (line == lines.length) {
            console.warn(`source line for instruction ${instructionId}(${sourceMapEntry.sourceId}:${sourceMapEntry.rangeStart}:${sourceMapEntry.rangeLength}) not found`);
            line = 0;
        }

        instructionToSourceLine.push(line);
    }

    const instructionsProfile: InstructionsProfile = [];
    for (const instruction of instructions.instructions) {
        instructionsProfile.push({
            bytecode: "0x" + instruction.bytecode,
            asm: instruction.asm,
            pc: instruction.pc,
            gas: 0,
            op: instruction.op
        });
    }

    const sourcesProfile: SourcesProfile = {};

    return {
        instructionsProfile,
        sourcesProfile,
        pcToInstructionId: instructions.pcToInstructionId,
        sourceMap,
        sourcesById,
        instructionToSourceLine
    }
}

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

function parseBytecode(bytecode: string, instructionCount: number) {
    const instructions: { bytecode: string, asm: string, pc: number, op: string }[] = [];
    const pcToInstructionId: { [pc: number]: number } = {};

    let i = 0;
    let currentInstruction = 0;
    while (i < bytecode.length && currentInstruction < instructionCount) {
        const pc = i / 2;
        pcToInstructionId[pc] = currentInstruction;

        let instructionBytecode = bytecode.substring(i, i + 2).toUpperCase();
        const opcode = parseInt(instructionBytecode, 16);
        const op = opcodes[opcode] ? opcodes[opcode] : "UNKNOWN";
        let asm = op;

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
            pc,
            op
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
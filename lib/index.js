"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.instructionsProfileToString = exports.sourcesProfileToString = exports.profile = exports.compile = void 0;
const solc_1 = __importDefault(require("solc"));
function compile(input) {
    return solc_1.default.compile(input);
}
exports.compile = compile;
function profile(trace, isDeploymentTransaction, address, contracts) {
    // all addresses should be upper case to avoid any case issues with comparing strings
    address = address.substring(2).toUpperCase();
    // make contract info map ignore case
    const contractsNcs = {};
    for (const address in contracts) {
        contractsNcs[address.substring(2).toUpperCase()] = contracts[address];
    }
    contracts = contractsNcs;
    // check at least the starting address is in the map
    if (!contracts[address]) {
        throw new Error(`${address} not found in contract info map`);
    }
    // if the originating contract calls any other contracts, we'll potentially be profiling
    // multiple contracts, so these are stored in a map of contract profiles
    const profiles = {};
    // create empty profile for originating address
    profiles[address] = createEmptyProfileForContract(contracts[address], isDeploymentTransaction);
    // calls don't contain the true gas cost at this point, it's the amount of gas sent to carry out
    // the call. So here preprocess the debug trace to calculate the actual gas spent at each call
    // by using gas before/after
    const callLogStack = [];
    for (let i = 0; i < trace.structLogs.length; ++i) {
        const log = trace.structLogs[i];
        // stack size + 1 for current call
        const currentCallDepth = callLogStack.length + 1;
        if (log.depth != currentCallDepth) {
            if (log.depth > currentCallDepth) {
                callLogStack.push(trace.structLogs[i - 1]);
            }
            else {
                const callLog = callLogStack.pop();
                callLog.gasCost = callLog.gas - log.gas;
            }
        }
    }
    // when a call to another contract occurs in a debug trace, the total gas cost is attributed to 
    // the callsite. If the call body is also profiled then you end up with the gas of the call body 
    // accounted for twice. So when generating the profile, it maintains a call stack in order to 
    // remove the gas cost of a call from its parent call(s). If the profiler doesn't have enough 
    // information to follow the call and profile its body, then the gas stays attributed to the 
    // call site.
    const callStack = [];
    let currentCall = {
        address: address,
        profile: profiles[address],
        gas: 0,
        callPC: -1
    };
    for (let i = 0; i < trace.structLogs.length; ++i) {
        const log = trace.structLogs[i];
        // callstack size + 1 for current call
        const currentCallDepth = callStack.length + 1;
        if (currentCallDepth != log.depth) {
            if (log.depth > currentCallDepth) {
                // making a nested call within this one
                // keep track of the pc for the call instruction
                currentCall.callPC = trace.structLogs[i - 1].pc;
                // push current call onto the stack
                callStack.push(currentCall);
                // create new call, we don't currently know address or profile, we may not be able 
                // to find them out
                currentCall = {
                    address: "#unknown-address#",
                    profile: undefined,
                    gas: 0,
                    callPC: -1
                };
                // to find the address, look at the call instruction
                const previousLog = trace.structLogs[i - 1];
                // we need to have the stack in the debug trace to extract the address
                if (previousLog.stack) {
                    // -2 here is because call/callcode/staticcall/delegatecall all put gas at the 
                    // top of the stack, and then the address of the contract being called.
                    // Ignore the first 24 chars because the high 12 bytes are all zeroes, addresses
                    // are 20 bytes.
                    const address = previousLog.stack[previousLog.stack.length - 2].substring(24).toUpperCase();
                    currentCall.address = address;
                    // see if we have info in the contract info map for this address
                    if (contracts[address]) {
                        // see if we already have a profile created for this address (we may do if 
                        // contract A calls B which calls A etc)
                        if (!profiles[address]) {
                            profiles[address] = createEmptyProfileForContract(contracts[address]);
                        }
                    }
                    currentCall.profile = profiles[address];
                }
            }
            else {
                // returning from a call
                // if we were able to profile this call, then remove its gas cost from parent calls
                if (currentCall.profile) {
                    for (const call of callStack) {
                        if (call.profile) {
                            call.gas -= currentCall.gas;
                            const instructionId = call.profile.pcToInstructionId[call.callPC];
                            call.profile.instructionsProfile[instructionId].gas -= currentCall.gas;
                        }
                    }
                }
                currentCall = callStack.pop();
            }
        }
        if (!currentCall.profile) {
            continue;
        }
        currentCall.gas += log.gasCost;
        if (currentCall.profile.pcToInstructionId[log.pc] === undefined) {
            throw new Error(`${currentCall.address}: couldn't find instruction for PC ${log.pc}`);
        }
        const instructionId = currentCall.profile.pcToInstructionId[log.pc];
        if (log.op != currentCall.profile.instructionsProfile[instructionId].op) {
            throw new Error(`${currentCall.address}: op in debug trace ${log.op} not same as instruction found in bytecode ${currentCall.profile.instructionsProfile[instructionId].op}`);
        }
        currentCall.profile.instructionsProfile[instructionId].gas += log.gasCost;
    }
    const result = {};
    for (const address in profiles) {
        const profile = profiles[address];
        // create sources profile from instructions profile
        const sourcesProfile = {};
        for (const instruction of profile.instructionsProfile) {
            // these are lazily created so we only output sources which contribute to gas usage for 
            // this txn
            if (!sourcesProfile[instruction.sourceId]) {
                sourcesProfile[instruction.sourceId] = {
                    name: profile.sourcesById[instruction.sourceId].name,
                    content: profile.sourcesById[instruction.sourceId].content,
                    lines: profile.sourcesById[instruction.sourceId].lines.map((line) => { return { text: line, gas: 0, instructions: [] }; })
                };
            }
            sourcesProfile[instruction.sourceId].lines[instruction.sourceLine].instructions.push(instruction);
            sourcesProfile[instruction.sourceId].lines[instruction.sourceLine].gas += instruction.gas;
        }
        result[address] = {
            instructionsProfile: profiles[address].instructionsProfile,
            sourcesProfile
        };
    }
    return result;
}
exports.profile = profile;
// example of how to format and present a sources profile in a readable way
function sourcesProfileToString(profile) {
    // need to find the biggest gas number to calculate the gas column width
    let biggestGasNumber = 100; // need at least 3 chars for column header "Gas"
    let longestCodeLine = 0;
    for (const address in profile) {
        const sourcesProfile = profile[address].sourcesProfile;
        for (const sourceId in sourcesProfile) {
            biggestGasNumber = sourcesProfile[sourceId].lines.reduce((biggest, line) => Math.max(biggest, line.gas), biggestGasNumber);
            longestCodeLine = sourcesProfile[sourceId].lines.reduce((longest, line) => Math.max(longest, line.text.length), longestCodeLine);
        }
    }
    const gasPad = Math.floor(Math.log10(biggestGasNumber)) + 1;
    let str = "";
    for (const address in profile) {
        str += `// ${address}\n`;
        str += `============================================\n`;
        const sourcesProfile = profile[address].sourcesProfile;
        for (const sourceId in sourcesProfile) {
            str += `\n// ${sourcesProfile[sourceId].name}\n\n`;
            str += `${"Gas".padEnd(gasPad, " ")} |\n`;
            str += `${"".padEnd(gasPad + longestCodeLine + 3, "-")}\n`;
            for (const line of sourcesProfile[sourceId].lines) {
                str += `${line.gas.toString().padEnd(gasPad, " ")} | ${line.text}\n`;
            }
        }
        str += "\n";
    }
    return str;
}
exports.sourcesProfileToString = sourcesProfileToString;
// example of how to format and present an instructions profile
function instructionsProfileToString(profile) {
    // same as above, want to display in neat columns so need to know what size each column must be
    const biggestGasNumber = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile.reduce((biggest, instruction) => {
            return Math.max(biggest, instruction.gas);
        }, biggest));
    }, 100); // 100 so we have at least 3 chars for the "Gas" header
    const gasPad = Math.floor(Math.log10(biggestGasNumber)) + 1;
    const biggestPc = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile[contractProfile.instructionsProfile.length - 1].pc);
    }, 16); // 16 so we have at least 2 chars for the "PC" header
    const pcPad = Math.floor(Math.log(biggestPc) / Math.log(16)) + 1;
    const asmPad = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile.reduce((longestAsmStr, instruction) => Math.max(longestAsmStr, instruction.asm.length), biggest));
    }, 3); // at least 3 for "Asm" header
    const bytecodePad = Object.values(profile).reduce((biggest, contractProfile) => {
        return Math.max(biggest, contractProfile.instructionsProfile.reduce((longestBytecode, instruction) => Math.max(longestBytecode, instruction.bytecode.length), biggest));
    }, 8); // at least 8 for "Bytecode" header
    let str = "";
    for (const address in profile) {
        str += `// ${address}\n============================================\n\n`;
        const instructionsProfile = profile[address].instructionsProfile;
        str += `${"Gas".padEnd(gasPad, " ")} | ${"PC".padEnd(pcPad, " ")} | ${"Asm".padEnd(asmPad, " ")} | Bytecode\n`;
        str += `${"".padEnd(gasPad + pcPad + asmPad + bytecodePad + 9, "-")}\n`;
        for (const instruction of instructionsProfile) {
            str += `${instruction.gas.toString().padEnd(gasPad, " ")} | ${instruction.pc.toString(16).toUpperCase().padEnd(pcPad, " ")} | ${instruction.asm.toString().padEnd(asmPad, " ")} | ${instruction.bytecode}\n`;
        }
    }
    return str;
}
exports.instructionsProfileToString = instructionsProfileToString;
function createEmptyProfileForContract(contractInfo, isDeployment = false) {
    const outputContract = contractInfo.output.contracts[contractInfo.sourceName][contractInfo.contractName];
    const bytecode = isDeployment ? outputContract.evm.bytecode : outputContract.evm.deployedBytecode;
    // source maps refer to source ids, so create a lookup of source ids to
    // sources, both generated and non-generated
    const sourcesById = {};
    for (const sourceName in contractInfo.output.sources) {
        const sourceId = contractInfo.output.sources[sourceName].id;
        sourcesById[sourceId] = {
            name: sourceName,
            content: contractInfo.input.sources[sourceName].content,
            lines: contractInfo.input.sources[sourceName].content.split("\n"),
            ast: contractInfo.output.sources[sourceName].ast
        };
    }
    if (bytecode.generatedSources) {
        for (const generatedSource of bytecode.generatedSources) {
            sourcesById[generatedSource.id] = {
                name: generatedSource.name,
                content: generatedSource.contents,
                lines: generatedSource.contents.split("\n"),
                ast: generatedSource.ast
            };
        }
    }
    const sourceMap = parseSourceMap(bytecode.sourceMap);
    const instructions = parseBytecode(bytecode.object, sourceMap.length);
    // generate human readable names for jumpdests
    // keep a map of pc -> jumpdest name, so that when the jumpdest is pushed onto the stack prior
    // to a jump instruction, it can be labelled with the correct name
    const jumpDestNames = {};
    // a function can contain multiple jumpdests, so we keep track of the count so we can give them
    // unique names, e.g. func_name_uint256_uint256_1/2/3/4 etc
    const functionJumpDestCounts = {};
    for (let i = 0; i < instructions.length; ++i) {
        if (instructions[i].asm == "JUMPDEST") {
            const sourceMapEntry = sourceMap[i];
            const rangeStart = sourceMapEntry.rangeStart;
            const rangeEnd = sourceMapEntry.rangeStart + sourceMapEntry.rangeLength - 1;
            const ast = sourcesById[sourceMapEntry.sourceId].ast;
            // use function so we can be recursive. When we find a node in the ast which corresponds
            // to a source range which contains the instruction source range, recursively search the
            // nodes children until we find the function node.
            function astFunctionSearch(ast) {
                let childNodes = [];
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
                    // generate a jumpdest name format as function_name_arg1type_arg2type_etc
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
                    jumpDestNames[instructions[i].pc] = jumpDestName;
                    instructions[i].asm += ` [${jumpDestName}]`;
                }
            }
        }
    }
    // generate human readable names for jumps
    for (let i = 0; i < instructions.length; ++i) {
        if (instructions[i].asm == "JUMP" ||
            instructions[i].asm == "JUMPI") {
            if (instructions[i - 1].asm.startsWith("PUSH")) {
                // split the instruction so we get the jumpdest value in hex that's being jumped to,
                // this is the PC of the jumpdest, so we use the jumpDestNames map to convert this
                // to a human readable name
                const bytes = instructions[i - 1].asm.split(" ")[1];
                const pc = parseInt(bytes.substring(2), 16);
                if (jumpDestNames[pc]) {
                    instructions[i - 1].asm += ` [${jumpDestNames[pc]}]`;
                }
                instructions[i].asm += " [in]";
            }
            else if (instructions[i - 1].asm == "POP") {
                instructions[i].asm += " [out]";
            }
        }
    }
    const instructionsProfile = [];
    for (let instructionId = 0; instructionId < instructions.length; ++instructionId) {
        const instruction = instructions[instructionId];
        const sourceMapEntry = sourceMap[instructionId];
        // figure out which line of the source code this range lies on (sometimes a source range 
        // spans multiple lines so we use the first line in the range)
        const sourceLines = sourcesById[sourceMapEntry.sourceId].lines;
        let totalChars = 0;
        let line;
        for (line = 0; line < sourceLines.length; ++line) {
            totalChars += sourceLines[line].length + 1; // + 1 for the \n character which has been removed already
            if (sourceMapEntry.rangeStart < totalChars) {
                break;
            }
        }
        if (line == sourceLines.length) {
            console.warn(`source line for instruction ${instructionId}(${sourceMapEntry.sourceId}:${sourceMapEntry.rangeStart}:${sourceMapEntry.rangeLength}) not found`);
            line = 0;
        }
        instructionsProfile.push({
            bytecode: "0x" + instruction.bytecode,
            asm: instruction.asm,
            pc: instruction.pc,
            gas: 0,
            op: instruction.op,
            sourceId: sourceMapEntry.sourceId,
            sourceRangeStart: sourceMapEntry.rangeStart,
            sourceRangeLength: sourceMapEntry.rangeLength,
            sourceLine: line
        });
    }
    const pcToInstructionId = instructions.reduce((pcToInstructionId, instruction, instructionId) => {
        pcToInstructionId[instruction.pc] = instructionId;
        return pcToInstructionId;
    }, {});
    return {
        instructionsProfile,
        pcToInstructionId,
        sourcesById
    };
}
function parseSourceMap(sourceMap) {
    // more info on source maps and how to parse them here:
    // https://docs.soliditylang.org/en/latest/internals/source_mappings.html
    const entries = [];
    const entry = {
        rangeStart: -1,
        rangeLength: -1,
        sourceId: -1,
        jump: "-",
        modifierDepth: -1
    };
    function updateEntryNumber(entrySplit, index, current) {
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
                entry.jump = entrySplit[3];
            }
        }
        // each source map entry is essentially a delta against the previous one, so here using
        // { ...entry } as an easy way to clone 'entry' as 'entry' will be reused
        entries.push({ ...entry });
    }
    return entries;
}
function parseBytecode(bytecode, instructionCount) {
    const instructions = [];
    for (let i = 0; i < bytecode.length && instructions.length < instructionCount; i += 2) {
        const pc = i / 2;
        let instructionBytecode = bytecode.substring(i, i + 2).toUpperCase();
        const opcode = parseInt(instructionBytecode, 16);
        const op = opcodes[opcode] ? opcodes[opcode] : "UNKNOWN";
        let asm = op;
        if (opcode >= 0x60 && opcode <= 0x7F) {
            // PUSHX opcodes are followed by 1+ bytes
            const byteCount = opcode - 0x5F;
            let bytes = bytecode.substring(i + 2, i + 2 + (byteCount * 2)).toUpperCase();
            instructionBytecode += bytes;
            // remove leading zeroes of the bytes being pushed
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
    }
    return instructions;
}
const opcodes = {
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
//# sourceMappingURL=index.js.map
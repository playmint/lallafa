export declare type DebugTrace = {
    gas: number;
    failed: boolean;
    returnValue: string;
    structLogs: DebugTraceLog[];
};
export declare type DebugTraceLog = {
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
};
export declare type CompilerOutput = {
    bytecode: ContractBytecode;
    deployedBytecode: ContractBytecode;
    sources: {
        [source: string]: {
            id: number;
            ast: any;
        };
    };
};
export declare type ContractBytecode = {
    bytecode: string;
    sourceMap: string;
    generatedSources: GeneratedSource[];
};
export declare type GeneratedSource = {
    id: number;
    name: string;
    contents: string;
    ast: any;
};
export declare type InstructionsProfile = {
    gas: number;
    bytecode: string;
    asm: string;
    pc: number;
}[];
export declare type SourcesProfile = {
    [source: number]: {
        name: string;
        lines: {
            gas: number;
            text: string;
        }[];
    };
};
export declare function profile(trace: DebugTrace, compilerOutput: CompilerOutput, inputSources: {
    sources: {
        [name: string]: {
            content: string;
        };
    };
}): {
    instructions: InstructionsProfile;
    sources: SourcesProfile;
};
export declare function sourcesProfileToString(sourcesProfile: SourcesProfile): string;
export declare function instructionsProfileToString(instructionsProfile: InstructionsProfile): string;
export declare type SourceMapEntry = {
    rangeStart: number;
    rangeLength: number;
    sourceId: number;
    jump: Jump;
    modifierDepth: number;
};
export declare type Jump = "in" | "out" | "-";
//# sourceMappingURL=index.d.ts.map
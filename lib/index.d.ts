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
    stack?: string[];
};
export declare type ContractInfoMap = {
    [address: string]: ContractInfo;
};
export declare type ContractInfo = {
    input: CompilerInput;
    output?: CompilerOutput;
    solcVersion?: string;
    sourceName: string;
    contractName: string;
};
export declare type CompilerInput = {
    sources: {
        [name: string]: {
            content: string;
        };
    };
    settings: {
        outputSelection: {};
    };
};
export declare type CompilerOutput = {
    contracts: {
        [sourceName: string]: {
            [contractName: string]: {
                evm?: {
                    bytecode?: CompilerOutputBytecode;
                    deployedBytecode?: CompilerOutputBytecode;
                };
            };
        };
    };
    sources: {
        [source: string]: {
            id: number;
            ast?: any;
        };
    };
};
export declare type CompilerOutputBytecode = {
    object: string;
    sourceMap: string;
    generatedSources?: GeneratedSource[];
};
declare type GeneratedSource = {
    id: number;
    name: string;
    contents: string;
    ast: any;
};
export declare type InstructionProfile = {
    gas: number;
    bytecode: string;
    asm: string;
    pc: number;
    op: string;
    sourceId: number;
    sourceRangeStart: number;
    sourceRangeLength: number;
    sourceLine: number;
};
export declare type SourcesProfile = {
    [sourceId: number]: {
        name: string;
        content: string;
        lines: {
            gas: number;
            text: string;
            instructions: InstructionProfile[];
        }[];
    };
};
declare type AstNode = {
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
declare type AstFunctionParameter = {
    nodeType: "VariableDeclaration";
    typeName: {
        name: string;
    };
};
export declare type SourcesById = {
    [id: number]: {
        name: string;
        content: string;
        lines: string[];
        ast: AstNode;
    };
};
export declare type Profile = {
    [address: string]: {
        instructionsProfile: InstructionProfile[];
        sourcesProfile: SourcesProfile;
    };
};
export declare function profile(trace: DebugTrace, isDeploymentTransaction: boolean, address: string, contracts: ContractInfoMap): Promise<Profile>;
export declare function sourcesProfileToString(profile: Profile): string;
export declare function instructionsProfileToString(profile: Profile): string;
export {};
//# sourceMappingURL=index.d.ts.map
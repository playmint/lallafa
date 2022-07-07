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
    output: CompilerOutput;
    input: {
        sources: {
            [name: string]: {
                content: string;
            };
        };
    };
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
declare type GeneratedSource = {
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
    op: string;
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
export declare type Profile = {
    [address: string]: {
        instructionsProfile: InstructionsProfile;
        sourcesProfile: SourcesProfile;
    };
};
export declare function profile(trace: DebugTrace, isDeploymentTransaction: boolean, address: string, contracts: ContractInfoMap): Profile;
export declare function sourcesProfileToString(profile: Profile): string;
export declare function instructionsProfileToString(profile: Profile): string;
export {};
//# sourceMappingURL=index.d.ts.map
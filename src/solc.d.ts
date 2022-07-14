declare module "solc" {
    const _default: {
        version: any;
        semver: () => any;
        license: any;
        lowlevel: {
            compileSingle: any;
            compileMulti: any;
            compileCallback: any;
            compileStandard: any;
        };
        features: {
            legacySingleInput: boolean;
            multipleInputs: boolean;
            importCallback: boolean;
            nativeStandardJSON: boolean;
        };
        compile: (input: any, readCallback?: any) => any;
        loadRemoteVersion: (versionString: any, cb: (err: any, solc: any) => void) => void;
    };
    export = _default;
}
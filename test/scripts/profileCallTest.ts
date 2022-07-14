import hre from "hardhat";
import { CallTestA__factory, CallTestB__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString, ContractInfoMap } from "../../src";


async function main() {
    const callTestAFactory = new CallTestA__factory((await hre.ethers.getSigners())[0]);
    const callTestBFactory = new CallTestB__factory((await hre.ethers.getSigners())[0]);
    const a = await callTestAFactory.deploy();
    const b = await callTestBFactory.deploy();

    await (await a.setB(b.address)).wait();
    await (await b.setA(a.address)).wait();

    const buildInfoA = await hre.artifacts.getBuildInfo("contracts/CallTestA.sol:CallTestA");
    const buildInfoB = await hre.artifacts.getBuildInfo("contracts/CallTestB.sol:CallTestB");
    if (!buildInfoA || !buildInfoB) {
        throw new Error("couldn't find build info for CallTest");
    }

    const contractInfo: ContractInfoMap = {};
    contractInfo[a.address] = {
        input: buildInfoA.input,
        output: buildInfoA.output,
        sourceName: "contracts/CallTestA.sol",
        contractName: "CallTestA"
    };
    contractInfo[b.address] = {
        input: buildInfoB.input,
        output: buildInfoB.output,
        sourceName: "contracts/CallTestB.sol",
        contractName: "CallTestB"
    };

    if (!fs.existsSync("output")) {
        fs.mkdirSync("output");
    }

    {
        const tx = await (await a.simple(42)).wait();

        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [tx.transactionHash, {
                "disableStack": false,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            false, // isDeployment
            a.address,
            contractInfo);

        fs.writeFileSync("output/calltest_simple_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/calltest_simple_instructions_profile.txt", instructionsProfileToString(result));
    }

    {
        const tx = await (await a.complex(42)).wait();

        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [tx.transactionHash, {
                "disableStack": false,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            false, // isDeployment
            a.address,
            contractInfo);

        fs.writeFileSync("output/calltest_complex_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/calltest_complex_instructions_profile.txt", instructionsProfileToString(result));
    }
}

main().catch(e => console.error(e));

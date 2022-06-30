import { HardhatUserConfig } from "hardhat/types";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
    solidity: "0.8.9",
    networks: {
        anvil: {
            url: "http://127.0.0.1:8545",
            accounts: {
                mnemonic: "test test test test test test test test test test test junk"
            }
        }
    }
}

export default config;
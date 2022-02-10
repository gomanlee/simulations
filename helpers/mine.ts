import Hardhat, { ethers } from 'hardhat'
import { BigNumber } from '@ethersproject/bignumber';

export const latestBlock = async () => ethers.provider.getBlockNumber();

// export const increaseBlock = async (blocks: number) => {
//     console.log("start", await hardhat.send("eth_blockNumber"));
//     await ethers.provider.send('evm_mine', [{}]);
//     console.log("start", await provider.send("eth_blockNumber"));
// }

export const advanceBlock = async (timestamp: number) =>
    await ethers.provider.send('evm_mine', [timestamp]);

export const advanceBlockTo = async (target: number) => {
    const currentBlock = await latestBlock();
    if (process.env.TENDERLY === 'true') {
        const pendingBlocks = target - currentBlock - 1;

        const response = await ethers.provider.send('evm_increaseBlocks', [
            `0x${pendingBlocks.toString(16)}`,
        ]);

        return;
    }
    const start = Date.now();
    let notified;
    if (target < currentBlock)
        throw Error(`Target block #(${target}) is lower than current block #(${currentBlock})`);
    // eslint-disable-next-line no-await-in-loop
    while ((await latestBlock()) < target) {
        if (!notified && Date.now() - start >= 5000) {
            notified = true;
            console.log("advanceBlockTo: Advancing too many blocks is causing this test to be slow.'");
        }
        // eslint-disable-next-line no-await-in-loop
        await advanceBlock(0);
    }
};


export const timeLatest = async () => {
    const block = await Hardhat.ethers.provider.getBlock('latest');
    return BigNumber.from(block.timestamp);
};

export const increaseTime = async (secondsToIncrease: number) => {
    if (process.env.TENDERLY === 'true') {
        await Hardhat.ethers.provider.send('evm_increaseTime', [`0x${secondsToIncrease.toString(16)}`]);
        return;
    }
    await Hardhat.ethers.provider.send('evm_increaseTime', [secondsToIncrease]);
    await Hardhat.ethers.provider.send('evm_mine', []);
};

// Workaround for time travel tests bug: https://github.com/Tonyhaenn/hh-time-travel/blob/0161d993065a0b7585ec5a043af2eb4b654498b8/test/test.js#L12
export const advanceTimeAndBlock = async function (forwardTime: number) {
    const currentBlockNumber = await Hardhat.ethers.provider.getBlockNumber();
    const currentBlock = await Hardhat.ethers.provider.getBlock(currentBlockNumber);

    if (currentBlock === null) {
        /* Workaround for https://github.com/nomiclabs/hardhat/issues/1183
         */
        await Hardhat.ethers.provider.send('evm_increaseTime', [forwardTime]);
        await Hardhat.ethers.provider.send('evm_mine', []);
        //Set the next blocktime back to 15 seconds
        await Hardhat.ethers.provider.send('evm_increaseTime', [15]);
        return;
    }
    const currentTime = currentBlock.timestamp;
    const futureTime = currentTime + forwardTime;
    await Hardhat.ethers.provider.send('evm_setNextBlockTimestamp', [futureTime]);
    await Hardhat.ethers.provider.send('evm_mine', []);
};

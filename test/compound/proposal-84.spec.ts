import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import Hardhat, { ethers } from 'hardhat'
import { TrueUSD, Compound } from 'contract-types'
import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { expect } from 'chai';
import { increaseTime, advanceBlockTo, advanceTimeAndBlock, advanceBlock } from '../../helpers'
const { TrueUsd__factory } = TrueUSD
const { Comptroller__factory, GovernorBravoDelegate__factory, CErc20Immutable__factory, Comp__factory, CToken__factory } = Compound


const Accounts = {
    a16z: '0x9aa835bc7b8ce13b9b0c9764a52fbf71ac62ccf1',
    tusdWhale: '0xf977814e90da44bfa03b6295a0616a897441acec',
    blck: '0x54a37d93e57c5da659f508069cf65a381b61e189'
}

const Contracts = {
    TUSD: '0x0000000000085d4780B73119b644AE5ecd22b376',
    Comp: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    cTUSD: '0x12392F67bdf24faE0AF363c24aC620a2f67DAd86',
    Comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    GovernanceBravo: '0xc0Da02939E1441F497fd74F78cE7Decb17B66529'
}

const Day = 24 * 60 * 60

enum Vote {
    Against = 0,
    For = 1,
    Abstain = 2
}
let signers: Record<keyof typeof Accounts, SignerWithAddress>
// transfer -> transfer ->  approve ->  mint 

async function supplyTusdAndClaim(testAccount: SignerWithAddress, amount: BigNumberish, startBlock: number, expectedComp: BigNumberish) {
    let tusd = TrueUsd__factory.connect(Contracts.TUSD, signers.tusdWhale);
    const decimals = await tusd.decimals();
    const tusdAmount = ethers.utils.parseUnits(BigNumber.from(amount).toString(), decimals);
    const testAccountBalance = await tusd.balanceOf(testAccount.address);
    if (testAccountBalance.lt(tusdAmount)) {
        // tusd whale transfer tusd to test account
        await (await tusd.transfer(testAccount.address, tusdAmount)).wait();
    }
    // test account supply tusd to compound
    tusd = tusd.connect(testAccount);
    const cTusd = CErc20Immutable__factory.connect(Contracts.cTUSD, testAccount);
    await (await tusd.approve(cTusd.address, tusdAmount)).wait();
    const approved = await tusd.allowance(testAccount.address, cTusd.address);
    await (await cTusd.mint(tusdAmount)).wait();
    
    // wait 
    // await advanceBlockTo()
    const increasedBlocks = 66459
    await advanceBlock(startBlock + increasedBlocks);
    await (await cTusd.redeem(await cTusd.balanceOf(testAccount.address))).wait();
    // claim
    const comptroller = Comptroller__factory.connect(Contracts.Comptroller, testAccount);
    await (await comptroller['claimComp(address)'](testAccount.address)).wait()
    const comp = Comp__factory.connect(Contracts.Comp, testAccount)
    // compare expectedComp with balance of comp
    const balanceOfComp: BigNumber = await comp.balanceOf(testAccount.address)
    console.log('balanceOfComp', balanceOfComp.toString())
    return balanceOfComp.eq(expectedComp)
}

describe('Proposal take effective', () => {
    before(async () => {
        // mock accounts
        const names = Object.keys(Accounts) as (keyof typeof Accounts)[]
        for (const name of names) {
            const account = Accounts[name]
            await Hardhat.network.provider.request({
                method: 'hardhat_impersonateAccount',
                params: [account],
            });
        }
        // gennerate signers
        signers = {} as Record<keyof typeof Accounts, SignerWithAddress>
        for (const name of names) {
            const account = Accounts[name]
            const signer = await Hardhat.ethers.getSigner(account)
            signers[name] = signer
        }
    })

    it('Users should be able to supply TUSD at Lending Pool, and get compound 0 before proposal is effective.', async () => {
        const [testAccount] = await ethers.getSigners();
        const waitTimestamp = 5 * Day
        const isExpectedBeforeExecProposal = await supplyTusdAndClaim(testAccount, '10000000', waitTimestamp, '0')
        expect(isExpectedBeforeExecProposal).to.be.equal(true)
    })

    let executedBlock
    it('Proposal should be passed.', async () => {
        let governance = GovernorBravoDelegate__factory.connect(Contracts.GovernanceBravo, signers.a16z);
        // mock a16z cast vote.
        // proposal id is 84, reference https://etherscan.io/tx/0xeb489fd91d14edf89bed3e26ed16f32743589e30a8ec80155ac1afa6890488b5#eventlog
        const proposalId = 84
        await (await governance.castVote(proposalId, Vote.For)).wait(); // a16z vote
        governance = governance.connect(signers.blck)
        await (await governance.castVote(proposalId, Vote.For)).wait(); // blck vote
        const proposal = await governance.proposals(proposalId);
        const forVotes: BigNumber = proposal.forVotes
        const againstVotes: BigNumber = proposal.againstVotes
        const proposalCreateEndBlock = 14172042
        // debugger
        await advanceBlockTo(proposalCreateEndBlock + 1)
        try {
            await (await governance.queue(proposalId)).wait();
        } catch (e) {
            debugger
        }
        //
        // const proposalCreateStartBlock = 14152332
        // const startBlock = await ethers.provider.getBlock(proposalCreateStartBlock)
        // const startTimestamp = startBlock.timestamp
        // const blocknumber = await ethers.provider.getBlockNumber()
        // const block = await ethers.provider.getBlock(blocknumber)
        // const currentTimestamp = block.timestamp
        // const diff = currentTimestamp - startTimestamp
        // debugger
        // advance blocknumber to proposal endBlock
        // console.log(await governance.state(proposalId))
        // await advanceBlockTo(proposalCreateEndBlock + 1);
        await increaseTime(3 * Day)
        try {
            await (await governance.execute(proposalId)).wait();
        } catch (e) {
            debugger
        }
        const executedBlockNumber = await ethers.provider.getBlockNumber()
        executedBlock = (await ethers.provider.getBlock(executedBlockNumber))
        const result = await governance.state(proposalId)
        // executed - 7
        expect(result).to.be.equal(7)
    })

    it('Users should be able to supply TUSD at Lending Pool, and get compound 0 before proposal is effective.', async () => {
        debugger
        const [testAccount] = await ethers.getSigners();
        const waitTimestamp = 5 * Day
        const cTUSD = CErc20Immutable__factory.connect(Contracts.cTUSD, testAccount)
        const totalBorrows: BigNumber = await cTUSD.totalBorrows()
        const totalSupply: BigNumber = await cTUSD.totalSupply()
        console.log(totalBorrows.toString(), totalSupply.toString())
        // const expectedCompAmount = days*supplyAmount*19.7/2*totalSupply()
        const isExpectedBeforeExecProposal = await supplyTusdAndClaim(testAccount, '10000000', waitTimestamp, '0')
        expect(isExpectedBeforeExecProposal).to.be.equal(true)
    })

})




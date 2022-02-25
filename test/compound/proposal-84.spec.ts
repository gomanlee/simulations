import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import Hardhat, { ethers } from 'hardhat'
import { TrueUSD, Compound } from 'contract-types'
import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { expect } from 'chai';
import { latestBlock, increaseTime, advanceBlockTo, advanceTimeAndBlock, advanceBlock } from '../../helpers'
import { proposal84 } from './proposal'
const { TrueUsd__factory } = TrueUSD
const { Comptroller__factory, CompoundLens__factory, GovernorBravoDelegate__factory, CErc20Immutable__factory, Comp__factory, CToken__factory } = Compound


const Accounts = {
    a16z: '0x9aa835bc7b8ce13b9b0c9764a52fbf71ac62ccf1',
    tusdWhale: '0xf977814e90da44bfa03b6295a0616a897441acec',
    blck: '0x54a37d93e57c5da659f508069cf65a381b61e189',
    jus: '0xf9f3c7abcce3e430b3aa8810bd332fc30df9701a'
}

const Contracts = {
    TUSD: '0x0000000000085d4780B73119b644AE5ecd22b376',
    Comp: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    cTUSD: '0x12392F67bdf24faE0AF363c24aC620a2f67DAd86',
    cDAI: '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
    cUSDT: '0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9',
    Comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    GovernanceBravo: '0xc0Da02939E1441F497fd74F78cE7Decb17B66529',
    CompoundLens: '0xdCbDb7306c6Ff46f77B349188dC18cEd9DF30299'
}

const Day = 24 * 60 * 60

const BlockPerDay = Math.ceil(Day / 13)

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

    // it('Users should be able to supply TUSD at Lending Pool, and get compound 0 before proposal is effective.', async () => {
    //     const [testAccount] = await ethers.getSigners();
    //     const waitTimestamp = 5 * Day
    //     const isExpectedBeforeExecProposal = await supplyTusdAndClaim(testAccount, '10000000', waitTimestamp, '0')
    //     expect(isExpectedBeforeExecProposal).to.be.equal(true)
    // })

    it('Proposal create.', async () => {
        let governance = GovernorBravoDelegate__factory.connect(Contracts.GovernanceBravo, signers.blck);
        // create propose, proposer's voted/COMP gt proposalThreshold(65000000000000000000000)
        const a = await (await governance.propose(
            proposal84.targets,
            proposal84.values,
            proposal84.signatures,
            proposal84.calldatas,
            proposal84.description,
            )).wait()
        const proposalId = (await governance.proposalCount()).toString()
        let proposalState = await governance.state(proposalId)
        expect(proposalState, 'proposal state should be pending').to.be.equal(0)
        // mock advance 2 day
        let currentBlock = await latestBlock();
        const votingDelay = (await governance.votingDelay()).toString()
        await advanceBlockTo(currentBlock + parseInt(votingDelay) + 1)
        proposalState = await governance.state(proposalId)
        expect(proposalState, 'proposal state should be active').to.be.equal(1)

        // mock a16z/blck cast vote. forVotes(await governance.proposals(proposalId)) must be gt quorumVotes(400000000000000000000000)
        governance = governance.connect(signers.a16z)
        await (await governance.castVote(proposalId, Vote.For)).wait(); // a16z vote
        governance = governance.connect(signers.blck)
        await (await governance.castVote(proposalId, Vote.For)).wait(); // blck vote

        // mock advance 3 day
        currentBlock = await latestBlock();
        const votingPeriod = (await governance.votingPeriod()).toString()
        await advanceBlockTo(currentBlock + parseInt(votingPeriod))
        proposalState = await governance.state(proposalId)
        expect(proposalState, 'proposal state should be successed').to.be.equal(4)

        try {
            await (await governance.queue(proposalId)).wait();
        } catch (e) {
            debugger
        }
        currentBlock = await latestBlock();
        await advanceBlockTo(currentBlock + 1)
        proposalState = await governance.state(proposalId)
        expect(proposalState, 'proposal state should be queue').to.be.equal(5)

        await increaseTime(2 * Day)
        try {
            await (await governance.execute(proposalId)).wait();
        } catch (e) {
            debugger
        }
        proposalState = await governance.state(proposalId)
        expect(proposalState, 'proposal state should be executed').to.be.equal(7)

        // verify proposal params whether to take effect, for propose84
        const comptroller = Comptroller__factory.connect(Contracts.Comptroller, signers.a16z);
        console.log('cTUSD collateral', await comptroller.markets(Contracts.cTUSD))
        console.log('compSpeeds cTusd', await comptroller.compSupplySpeeds(Contracts.cTUSD))
        console.log('compSpeeds cDai', await comptroller.compSupplySpeeds(Contracts.cDAI))
        console.log('compSpeeds cUSDT', await comptroller.compSupplySpeeds(Contracts.cUSDT))
    })


/*
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
*/
})

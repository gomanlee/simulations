import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import Hardhat, { ethers } from 'hardhat'
import { TrueUSD, Compound } from 'contract-types'
import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { expect } from 'chai';
import { latestBlock, increaseTime, advanceBlockTo, advanceTimeAndBlock, advanceBlock } from '../../helpers'
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

// /*
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

    let executedBlock
    it('Proposal should be passed.', async () => {
        let governance = GovernorBravoDelegate__factory.connect(Contracts.GovernanceBravo, signers.jus);
        console.log('votingDelay', await governance.votingDelay())
        console.log('votingPeriod', await governance.votingPeriod())
        // const proposalThreshold = await governance.proposalThreshold()
        // console.log('proposalThreshold cloud', proposalThreshold)
        // const comp = Comp__factory.connect(Contracts.Comp, signers.jus)
        // // compare expectedComp with balance of comp
        // const balanceOfComp: BigNumber = await comp.balanceOf(signers.jus.address)
        // console.log('balanceOfComp', balanceOfComp.toString(), balanceOfComp)
        // if (balanceOfComp.lt(proposalThreshold)) {
        //     return 'Comp balance should gt proposal threshold'
        // }
        // create proposal
        // const comptroller = Comptroller__factory.connect(Contracts.Comptroller, signers.a16z);

        // console.log('cTUSD collatera exec', await comptroller.markets(Contracts.cTUSD))
        // console.log('cDAI collatera exec', await comptroller.markets(Contracts.cDAI))
        // console.log('cUSDT collatera exec', await comptroller.markets(Contracts.cUSDT))
        const proposalResponse = await (await governance.propose(
            [Contracts.Comptroller, Contracts.Comptroller],
            // [0, 0],
            [ BigNumber.from(0), BigNumber.from(0) ],
            ['_setCollateralFactor(address,uint256)', '_setCompSpeeds(address[],uint256[],uint256[])'],
            ['0x00000000000000000000000012392f67bdf24fae0af363c24ac620a2f67dad860000000000000000000000000000000000000000000000000b1a2bc2ec500000',
            '0x0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000000400000000000000000000000039aa39c021dfbae8fac545936693ac917d5e75630000000000000000000000005d3a536e4d6dbd6114cc1ead35777bab948e3643000000000000000000000000f650c3d88d12db855b8bf7d11be6c55a4e07dcc900000000000000000000000012392f67bdf24fae0af363c24ac620a2f67dad86000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000ec4165cd90400000000000000000000000000000000000000000000000000000ec4165cd904000000000000000000000000000000000000000000000000000002081e063b1e0000000000000000000000000000000000000000000000000000005543df729c000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000ec4165cd90400000000000000000000000000000000000000000000000000000ec4165cd904000000000000000000000000000000000000000000000000000002081e063b1e0000000000000000000000000000000000000000000000000000005543df729c000'],
            'compound simulation'
            )).wait()
        // console.log('proposal cloud', proposalResponse)
        const proposalAction = await governance.getActions(85)
        // console.log('proposalAction cloud', proposalAction)
        const proposalState = await governance.state(85)
        console.log('proposalState cloud', proposalState)
        const comp = Comp__factory.connect(Contracts.Comp, signers.jus)
        const jusVotes = await comp.getCurrentVotes(signers.jus.address)
        const a16zVotes = await comp.getCurrentVotes(signers.a16z.address)
        console.log('votes cloud', jusVotes, a16zVotes)
        // Gets the prior number of votes for an account at a specific block number.
        // const jusPriorVotes = await comp.getPriorVotes(signers.jus.address, 12816405)
        // const a16zPriorVotes = await comp.getPriorVotes(signers.a16z.address, 12816405)
        // console.log('priorVotes cloud', jusPriorVotes, a16zPriorVotes)
        const currentBlock = await latestBlock();
        console.log('currentBlock cloud', currentBlock)
        // await advanceTimeAndBlock(Day * 2)
        const proposalCreateEndBlock = 14216408
        // debugger
        // await increaseTime(2 * Day)
        // block advance is effctive
        await advanceBlockTo(proposalCreateEndBlock + BlockPerDay * 2)
        console.log('proposalState cloud next', await governance.state(85))
        console.log('currentBlock cloud', await latestBlock())
        // console.log('quorumVotes', await governance.quorumVotes())
        // mock a16z cast vote.
        // proposal id is 84, reference https://etherscan.io/tx/0xeb489fd91d14edf89bed3e26ed16f32743589e30a8ec80155ac1afa6890488b5#eventlog

        const proposalId = 85
        governance = governance.connect(signers.a16z)
        await (await governance.castVote(proposalId, Vote.For)).wait(); // a16z vote
        governance = governance.connect(signers.blck)
        await (await governance.castVote(proposalId, Vote.For)).wait(); // blck vote
        const proposal = await governance.proposals(proposalId);
        console.log('proposal cloud', proposal)
        await advanceBlockTo(proposalCreateEndBlock + BlockPerDay * 5)
        console.log('proposalState cloud next vote', await governance.state(85))
        const comptroller = Comptroller__factory.connect(Contracts.Comptroller, signers.a16z);
        console.log('cTUSD collatera', await comptroller.markets(Contracts.cTUSD))
        console.log('cDAI collatera', await comptroller.markets(Contracts.cDAI))



        // const forVotes: BigNumber = proposal.forVotes
        // const againstVotes: BigNumber = proposal.againstVotes
        // const proposalCreateEndBlock = 14172042
        // debugger
        // await advanceBlockTo(proposalCreateEndBlock + 1)



        try {
            await (await governance.queue(proposalId)).wait();
        } catch (e) {
            debugger
        }
        await advanceBlockTo(proposalCreateEndBlock + BlockPerDay * 7)
        console.log('proposalState cloud next queue', await governance.state(85))



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
        await advanceBlockTo(proposalCreateEndBlock + BlockPerDay * 10)
        console.log('proposalState cloud next exec', await governance.state(85))
        console.log('cTUSD collatera exec', await comptroller.markets(Contracts.cTUSD))
        console.log('compSpeeds cTusd', await comptroller.compSupplySpeeds(Contracts.cTUSD))
        console.log('compSpeeds cDai', await comptroller.compSupplySpeeds(Contracts.cDAI))
        console.log('compSpeeds cUSDT', await comptroller.compSupplySpeeds(Contracts.cUSDT))


        // const executedBlockNumber = await ethers.provider.getBlockNumber()
        // executedBlock = (await ethers.provider.getBlock(executedBlockNumber))
        // const result = await governance.state(proposalId)
        // // executed - 7
        // expect(result).to.be.equal(7)
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
// */

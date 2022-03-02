import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import Hardhat from 'hardhat'
import { Compound } from 'contract-types'
import { proposal84, Accounts, Contracts } from './proposal.config'
import { latestBlock, increaseTime, advanceBlockTo } from '../../helpers'
const { Comptroller__factory, CompoundLens__factory, GovernorBravoDelegate__factory, CErc20Immutable__factory, Comp__factory, CToken__factory } = Compound

enum Vote {
    Against = 0,
    For = 1,
    Abstain = 2
}
const Day = 24 * 60 * 60

let signers: Record<keyof typeof Accounts, SignerWithAddress>
// transfer -> transfer ->  approve ->  mint

const signerHandle = async () => {
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
}

export const createProposal = async (proposalParams: typeof proposal84) => {
    await signerHandle()
    let governance = GovernorBravoDelegate__factory.connect(Contracts.GovernanceBravo, signers.blck);
    // create propose, proposer's voted/COMP gt proposalThreshold(65000000000000000000000)
    await (await governance.propose(
        proposalParams.targets,
        proposalParams.values,
        proposalParams.signatures,
        proposalParams.calldatas,
        proposalParams.description
        )).wait()
    const proposalId = (await governance.proposalCount()).toString()
    // mock advance 2 day
    let currentBlock = await latestBlock();
    const votingDelay = (await governance.votingDelay()).toString()
    await advanceBlockTo(currentBlock + parseInt(votingDelay) + 1)

    // mock a16z/blck cast vote. forVotes(await governance.proposals(proposalId)) must be gt quorumVotes(400000000000000000000000)
    governance = governance.connect(signers.a16z)
    await (await governance.castVote(proposalId, Vote.For)).wait(); // a16z vote
    governance = governance.connect(signers.blck)
    await (await governance.castVote(proposalId, Vote.For)).wait(); // blck vote

    // mock advance 3 day
    currentBlock = await latestBlock();
    const votingPeriod = (await governance.votingPeriod()).toString()
    await advanceBlockTo(currentBlock + parseInt(votingPeriod))

    try {
        await (await governance.queue(proposalId)).wait();
    } catch (e) {
        throw new Error('queue function fail')
    }
    currentBlock = await latestBlock();
    await advanceBlockTo(currentBlock + 1)

    await increaseTime(2 * Day)
    try {
        await (await governance.execute(proposalId)).wait();
    } catch (e) {
        throw new Error('execute function fail')
    }
    const proposalState = await governance.state(proposalId)
    return proposalState
}

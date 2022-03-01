import { expect } from 'chai';
import { proposal84 } from '../../src/compound/proposal.config'
import { createProposal} from '../../src/compound/proposal'

describe('Proposal take effective', () => {
    it('Proposal create.', async () => {
        const proposalState = await createProposal(proposal84)
        expect(proposalState, 'proposal state should be executed').to.be.equal(7)
    })
})

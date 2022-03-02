import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Hardhat, { ethers } from "hardhat";
import { TrueUSD, Compound } from "contract-types";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { expect } from "chai";
import {
  increaseTime,
  advanceBlockTo,
  advanceTimeAndBlock,
  advanceBlock,
  latestBlock,
} from "../../helpers";
import { CompoundLens__factory } from "contract-types/types/Compound/types";
import { ENGINE_METHOD_ALL } from "constants";

import { proposal84 } from '../../src/compound/proposal.config'
import { createProposal} from '../../src/compound/proposal'

const { TrueUsd__factory } = TrueUSD;
const {
  Comptroller__factory,
  GovernorBravoDelegate__factory,
  CErc20Immutable__factory,
  Comp__factory,
  CToken__factory,
  CEther__factory,
} = Compound;

import { priceFeedAbi } from '../../abis/compound.json';

const Accounts = {
  a16z: "0x9aa835bc7b8ce13b9b0c9764a52fbf71ac62ccf1",
  tusdWhale: "0xf977814e90da44bfa03b6295a0616a897441acec",
  blck: "0x54a37d93e57c5da659f508069cf65a381b61e189",
};

const Contracts = {
  TUSD: "0x0000000000085d4780B73119b644AE5ecd22b376",
  Comp: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
  cTUSD: "0x12392F67bdf24faE0AF363c24aC620a2f67DAd86",
  Comptroller: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B",
  GovernanceBravo: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  cEth: "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
  cDai: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
  cUSDT: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
  cUSDC: '0x39aa39c021dfbae8fac545936693ac917d5e7563',
  Dai:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  priceFeed: '0x6d2299c48a8dd07a872fdd0f8233924872ad1071'
}

let testAccounts: SignerWithAddress[] = []

const Day = 24 * 60 * 60;
const underlyingDecimals = 18;
const proposalId = 84;
const pass_state = 7;

enum Vote {
  Against = 0,
  For = 1,
  Abstain = 2,
}
// let signers: Record<keyof typeof Accounts, SignerWithAddress>
let signers: Record<keyof typeof Accounts, SignerWithAddress>;

describe("verification after proposal take effective", () => {
  before(async () => {
    // mock accounts
    const names = Object.keys(Accounts) as (keyof typeof Accounts)[];
    for (const name of names) {
      const account = Accounts[name];
      await Hardhat.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [account],
      });
    }
    // gennerate signers
    signers = {} as Record<keyof typeof Accounts, SignerWithAddress>;
    for (const name of names) {
      const account = Accounts[name];
      const signer = await Hardhat.ethers.getSigner(account);
      signers[name] = signer;
    }

    testAccounts = await ethers.getSigners()

    const startBlock = await latestBlock();
    console.log("from block: ", startBlock);
    // 14235992 is the estimated block after proposal executed if start number 14216408
    if (startBlock < 14235992) {
      console.log("begin ts:", new Date());
      // const result = await voteToPassProposal();
      const proposalState = await createProposal(proposal84)
      console.log("byend ts:", new Date());
      const endBlock = await latestBlock();
      console.log("end  block: ", endBlock);
    } else {
      console.log("vote and pass proposal done");
    }

    const state = await getProposalState();
    expect(state, 'proposal should be executed').to.be.eq(pass_state);
  });

  let executedBlock;

  it("Users should be able to supply TUSD at Lending Pool, and get compound after proposal is effective.", async () => {
    // get testAccount
    let testAccount: SignerWithAddress = testAccounts[0]

    let amount = 100000
    await transferTusd(amount, testAccount.address);

    let tusd = TrueUsd__factory.connect(Contracts.TUSD, testAccount)
    const cEth = CEther__factory.connect(Contracts.cEth, testAccount)
    const cTusd = CErc20Immutable__factory.connect(
      Contracts.cTUSD,
      testAccount
    );
    const comptroller = Comptroller__factory.connect(
      Contracts.Comptroller,
      testAccount
    );

    
    let cTokenBalance = await (await cTusd.callStatic.balanceOf(testAccount.address));
    expect(cTokenBalance).to.be.eq(0)
    
    // test account supply tusd to the protocol as collateral (you will get cTusd in return)
    const decimals = await tusd.decimals();
    const tusdAmount = ethers.utils.parseUnits(BigNumber.from(amount).toString(), decimals);
    await (await tusd.approve(cTusd.address, tusdAmount)).wait();
    const mintResult = await (await cTusd.mint(tusdAmount)).wait();  
    let balance_tmp = await cTusd.balanceOf(testAccount.address)
    // let cTokenBalance = await cTusd.callStatic.balanceOf(testAccount.address) / Math.pow(10, underlyingDecimals)
    cTokenBalance = await cTusd.callStatic.balanceOf(testAccount.address)
    debugger
    expect(cTokenBalance.toNumber()).to.be.greaterThan(0)

    const comp = Comp__factory.connect(Contracts.Comp, testAccount)
    // compare expectedComp with balance of comp
    let balanceOfComp: BigNumber = await comp.balanceOf(testAccount.address)
    console.log('balanceOfComp init reward: ', balanceOfComp.toString())
    expect(balanceOfComp.toNumber()).to.be.lessThanOrEqual(0)

    const latestBlock = await ethers.provider.getBlockNumber();
    // const increasedBlocks = 66459
    const increasedBlocks = 16459
    await advanceBlockTo(latestBlock + increasedBlocks)
    // redeem
    await (await cTusd.redeem(balance_tmp)).wait();
    // claim
    await (await comptroller['claimComp(address)'](testAccount.address)).wait()

    balanceOfComp = await comp.balanceOf(testAccount.address)
    expect(balanceOfComp).to.be.gt(0)
  });

  it('verify collateralFactor value', async () => {
    let testAccount: SignerWithAddress = testAccounts[1]

    const comptroller = Comptroller__factory.connect(
        Contracts.Comptroller,
        testAccount
    );
    let markets = [ Contracts.cUSDT]; 
    await (await comptroller.enterMarkets(markets)).wait()

    let {0:isListed, 1:collateralFactor} = await comptroller.callStatic.markets(Contracts.cTUSD)
    expect(isListed).to.be.true
    let factorRate = collateralFactor as any / 1e18 * 100
    expect(factorRate, 'collateral factor rate to 80%').to.be.eq(80) 

    let compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cTUSD)
    expect(compSupplySpeed, 'cTUSD compSpeeds').to.be.eq(BigNumber.from('1500000000000000'))

    let compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cTUSD)
    expect(compBorrowSpeed, 'cTUSD compSpeeds').to.be.eq(BigNumber.from('1500000000000000'))

    compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cUSDT)
    expect(compSupplySpeed, 'cUsdt compSpeeds').to.be.eq(BigNumber.from('9150000000000000'))

    compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cUSDT)
    expect(compBorrowSpeed, 'cUsdt compSpeeds').to.be.eq(BigNumber.from('9150000000000000'))

    compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cDai)
    expect(compSupplySpeed, 'cDai compSpeeds').to.be.eq(BigNumber.from('66500000000000000'))

    compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cDai)
    expect(compBorrowSpeed, 'cDai compSpeeds').to.be.eq(BigNumber.from('66500000000000000'))

    compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cUSDC)
    expect(compSupplySpeed, 'cUsdc compSpeeds').to.be.eq(BigNumber.from('66500000000000000'))

    compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cUSDC)
    expect(compBorrowSpeed, 'cUsdc compSpeeds').to.be.eq(BigNumber.from('66500000000000000'))

  })

  it("User could borrow cEth by cTusd after proposal effective", async () => {
    let testAccount: SignerWithAddress = testAccounts[2]

    const comptroller = Comptroller__factory.connect(
        Contracts.Comptroller,
        testAccount
    );

    let amount = 100000;
    await transferTusd(amount, testAccount.address);

    let tusd = TrueUsd__factory.connect(Contracts.TUSD, testAccount);
    const cEth = CEther__factory.connect(Contracts.cEth, testAccount);
    const cTusd = CErc20Immutable__factory.connect(
      Contracts.cTUSD,
      testAccount
    );

    let cTokenBalance = await (await cTusd.callStatic.balanceOf(testAccount.address)).toNumber() / Math.pow(10, underlyingDecimals);
    expect(cTokenBalance, 'test account has 0 cTusd before mint').to.be.eq(0)

    // test account supply tusd to the protocol as collateral (you will get cTusd in return)
    const decimals = await tusd.decimals();
    const tusdAmount = ethers.utils.parseUnits(
      BigNumber.from(amount).toString(),
      decimals
    );

    await (await tusd.approve(cTusd.address, tusdAmount)).wait();
    const mintResult = await (await cTusd.mint(tusdAmount)).wait();

    cTokenBalance = await (await cTusd.callStatic.balanceOf(testAccount.address)).toNumber() / Math.pow(10, underlyingDecimals);
    expect(cTokenBalance, 'test account has ctusd after mint').to.be.gt(0)

    // cTusd enter market
    const markets = [Contracts.cTUSD]; 
    await (await comptroller.enterMarkets(markets)).wait();

    let underlyingToBorrow = 0.001;
    const scaledUpBorrowAmount = (
      underlyingToBorrow * Math.pow(10, underlyingDecimals)
    ).toString();

    const borrow = await cEth.borrow(ethers.utils.parseEther(underlyingToBorrow.toString()));
    const borrowResult = await borrow.wait(1);

    let borrowBalance = await getBorrowBalance(testAccount.address, cEth)
    debugger
    expect(borrowBalance).to.be.eq(underlyingToBorrow)

  });

  it('tusd collateral factor rate should be 80%', async () => {
    let testAccount: SignerWithAddress = testAccounts[3]

    const comptroller = Comptroller__factory.connect(
        Contracts.Comptroller,
        testAccount
    );

    let collateralAmount = 10;

    await transferTusd(10000, testAccount.address);

    let tusd = TrueUsd__factory.connect(Contracts.TUSD, testAccount);
    const cDai = CErc20Immutable__factory.connect(Contracts.cDai, testAccount);
    const cTusd = CErc20Immutable__factory.connect(
      Contracts.cTUSD,
      testAccount
    );

    // let cTokenBalance = await (await cTusd.callStatic.balanceOf(testAccount.address)).toNumber() / Math.pow(10, underlyingDecimals);
    let cTokenBalance = await getBalanceOf(testAccount.address, cTusd)
    expect(cTokenBalance, 'test account has 0 cTusd before mint').to.be.eq(0)

    // test account supply tusd to the protocol as collateral (you will get cTusd in return)
    const decimals = await tusd.decimals();

    console.log('tusd balance before mint: ', await getBalanceOf(testAccount.address, tusd))

    const tusdAmount = ethers.utils.parseUnits(
        collateralAmount.toString(),
        decimals
    );

    await (await tusd.approve(cTusd.address, tusdAmount)).wait();
    await (await cTusd.mint(tusdAmount)).wait();

    console.log('tusd balance after mint: ', await getBalanceOf(testAccount.address, tusd))
    console.log('after mint cTusd Balance: ', await getBalanceOf(testAccount.address, cTusd))
    cTokenBalance = await getBalanceOf(testAccount.address, cTusd)
    expect(cTokenBalance, 'test account has ctusd after mint').to.be.gt(0)

    // cTusd enter market
    const markets = [Contracts.cTUSD]; 
    await (await comptroller.enterMarkets(markets)).wait();

    // liquidity is USD price asset
    let { 1:liquidity, 2: shortfail } = await comptroller.getAccountLiquidity(testAccount.address);
    let liquidity_value = ethers.utils.formatUnits(liquidity, underlyingDecimals)
    let shortfail_value = ethers.utils.formatUnits(shortfail, underlyingDecimals)
    
    const priceFeed = new ethers.Contract(Contracts.priceFeed, priceFeedAbi, testAccount);
    let underlyingPriceInUsd = await priceFeed.price('TUSD');
    underlyingPriceInUsd = underlyingPriceInUsd / 1e6;

    console.log('underlyingPriceInUsd: ', underlyingPriceInUsd)
    console.log(`1 TUSD == ${underlyingPriceInUsd.toFixed(6)} USD`);
    console.log(`You can borrow up to ${liquidity_value} USD worth of assets from the protocol.`);    
    console.log(`short fail ${shortfail_value}.`);    

    let underlyingToBorrow = 7;

    const scaledUpBorrowAmount = ethers.utils.parseUnits(underlyingToBorrow.toString(), underlyingDecimals).toString()

    const borrow = await cDai.borrow(scaledUpBorrowAmount);
    const borrowResult = await borrow.wait(1);

    let borrowBalance = await getBorrowBalance(testAccount.address, cDai)
    expect(borrowBalance).to.be.eq(underlyingToBorrow)

    let failure = borrowResult?.events?.find(_ => _.event === 'Failure');
    if (failure) {
      const errorCode = failure?.args?.error;
      expect.fail(`below liquidity, but borrow failed, code ${errorCode}`)
    }

    // borrow amount out of the liqidity range
    const overAmount = '2'
    let overBorrowAmount = ethers.utils.parseUnits(overAmount, underlyingDecimals).toString()
    const overBorrowResult = await (await cDai.borrow(overBorrowAmount)).wait()

    failure = overBorrowResult?.events?.find(_ => _.event === 'Failure');
    if (failure){
        const errorCode = failure?.args?.error;
        console.log('expect to get error code: ', errorCode.toNumber())
    }else{
        expect.fail('over liquidity, expect to get failure event when borrow')
    }

  })

});

async function getProposalState() {
    let governance = GovernorBravoDelegate__factory.connect(
        Contracts.GovernanceBravo,
        signers.a16z
    );
    const proposalId = (await governance.proposalCount()).toString()
    const proposal = await governance.proposals(proposalId);
    const state = await governance.state(proposalId);
    return state;
}

async function voteToPassProposal() {
  // proposal id is 84, reference https://etherscan.io/tx/0xeb489fd91d14edf89bed3e26ed16f32743589e30a8ec80155ac1afa6890488b5#eventlog
  const proposalId = 84;

  // instance governance contract
  let governance = GovernorBravoDelegate__factory.connect(
    Contracts.GovernanceBravo,
    signers.a16z
  );
  // mock a16z cast vote.

  // transfer 0.1 eth to z16z
  let eth_balance = await ethers.provider.getBalance(signers.blck.address);
  console.log("blck eth_balance: " + ethers.utils.formatEther(eth_balance));
  const tx = ethers.provider.getSigner(signers.blck.address).sendTransaction({
    to: signers.a16z.address,
    value: ethers.utils.parseEther("0.1"),
  });

  eth_balance = await ethers.provider.getBalance(signers.a16z.address);
  console.log("a16z eth_balance: " + ethers.utils.formatEther(eth_balance));

  const comp1 = Comp__factory.connect(Contracts.Comp, signers.a16z);
  const a16z_balance: BigNumber = await comp1.balanceOf(signers.a16z.address);
  const a16z_votes = await comp1.getCurrentVotes(signers.a16z.address);
  governance = governance.connect(signers.a16z);
  await (await governance.castVote(proposalId, Vote.For)).wait(); // a16z vote

  const comp2 = Comp__factory.connect(Contracts.Comp, signers.blck);

  governance = governance.connect(signers.blck);
  const blck_balance: BigNumber = await comp2.balanceOf(signers.blck.address);
  const blck_votes = await comp2.getCurrentVotes(signers.blck.address);
  await (await governance.castVote(proposalId, Vote.For)).wait(); // blck vote

  await trace_proposal(governance, proposalId);

  const proposalCreateEndBlock = 14172042;
  // debugger
  await advanceBlockTo(proposalCreateEndBlock + 1);

  try {
    await (await governance.queue(proposalId)).wait();
  } catch (e) {
    debugger;
  }

  await increaseTime(3 * Day);
  try {
    await (await governance.execute(proposalId)).wait();
  } catch (e) {
    debugger;
  }
  const executedBlockNumber = await ethers.provider.getBlockNumber();
  // executedBlockNumber = await ethers.provider.getBlock(executedBlockNumber);
  const result = await governance.state(proposalId);
  // executed - 7
  expect(result).to.be.equal(7);
  await trace_proposal(governance, proposalId);
}

async function trace_proposal(
  governance: Compound.GovernorBravoDelegate,
  proposalId: number
) {
  const proposal = await governance.proposals(proposalId);
  const state = await governance.state(proposalId);
  console.log("proposal state: " + state);

  const forVotes: BigNumber = proposal.forVotes;
  const againstVotes: BigNumber = proposal.againstVotes;
}

async function transferTusd(amount: number, address: string) {
  let tusd = TrueUsd__factory.connect(Contracts.TUSD, signers.tusdWhale);
  const decimals = await tusd.decimals();
  const tusdAmount = ethers.utils.parseUnits(
    BigNumber.from(amount).toString(),
    decimals
  );
  const testAccountBalance = await tusd.balanceOf(address);
  if (testAccountBalance.lt(tusdAmount)) {
    // tusd whale transfer tusd to test account
    await (await tusd.transfer(address, tusdAmount)).wait();
  }
}

async function getBorrowBalance(address:string, cToken: any){
    let balance = await cToken.callStatic.borrowBalanceCurrent(address);
    balance = balance / Math.pow(10, underlyingDecimals);
    return balance
}

async function getBalanceOf(address:String, token: any){
    let balance = await token.callStatic.balanceOf(address)
    balance = balance / Math.pow(10, underlyingDecimals);
    return balance
}

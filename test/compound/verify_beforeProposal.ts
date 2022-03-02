import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Hardhat, { ethers } from "hardhat";
import { TrueUSD, Compound } from "contract-types";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { expect} from "chai";

import {
  increaseTime,
  advanceBlockTo,
  advanceTimeAndBlock,
  advanceBlock,
  latestBlock,
} from "../../helpers";
import { CompoundLens__factory } from "contract-types/types/Compound/types";
import { Address } from "cluster";
import { BaseContract } from "ethers";

const { TrueUsd__factory } = TrueUSD;
const {
  Comptroller__factory,
  GovernorBravoDelegate__factory,
  CToken__factory,
  CEther__factory,
  CErc20Immutable__factory,
  Comp__factory,
} = Compound;

let Accounts = {
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
};

const underlyingDecimals = 18;
const proposalId = 84;
const pass_state = 7;

let signers: Record<keyof typeof Accounts, SignerWithAddress>;
let testAccounts: SignerWithAddress[] = []
describe("verification before proposal take effective", () => {
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
  });

  it('verify collateralFactor', async () => {
    let testAccount: SignerWithAddress = testAccounts[1]
    const state = await getProposalState();
    expect(state).not.eq(pass_state);
    const comptroller = Comptroller__factory.connect(
        Contracts.Comptroller,
        testAccount
    );
    let markets = [ Contracts.cUSDT]; 
    await (await comptroller.enterMarkets(markets)).wait()

    let {0:isListed, 1:collateralFactor} = await comptroller.callStatic.markets(Contracts.cTUSD)
    expect(isListed).to.be.true
    let factorRate = collateralFactor as any / 1e18 * 100
    expect(factorRate, 'collateral factor rate to 0%').to.be.eq(0) 

    let compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cTUSD)
    expect(compSupplySpeed, 'cTUSD compSpeeds').to.be.eq(BigNumber.from('0'))

    let compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cTUSD)
    expect(compBorrowSpeed, 'cTUSD compSpeeds').to.be.eq(BigNumber.from('0'))

    compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cUSDT)
    expect(compSupplySpeed, 'cUsdt compSpeeds').to.be.eq(BigNumber.from('9650000000000000'))

    compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cUSDT)
    expect(compBorrowSpeed, 'cUsdt compSpeeds').to.be.eq(BigNumber.from('9650000000000000'))

    compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cDai)
    expect(compSupplySpeed, 'cDai compSpeeds').to.be.eq(BigNumber.from('67000000000000000'))

    compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cDai)
    expect(compBorrowSpeed, 'cDai compSpeeds').to.be.eq(BigNumber.from('67000000000000000'))

    compSupplySpeed = await comptroller.compSupplySpeeds(Contracts.cUSDC)
    expect(compSupplySpeed, 'cUsdc compSpeeds').to.be.eq(BigNumber.from('67000000000000000'))

    compBorrowSpeed = await comptroller.compSupplySpeeds(Contracts.cUSDC)
    expect(compBorrowSpeed, 'cUsdc compSpeeds').to.be.eq(BigNumber.from('67000000000000000'))

  })

  it("User could borrow cTusd with cEth collateral", async () => {
    const [testAccount] = await ethers.getSigners();

    let tusd = TrueUsd__factory.connect(Contracts.TUSD, testAccount)
    const cEth = CEther__factory.connect(Contracts.cEth, testAccount)
    const cDai = CErc20Immutable__factory.connect(Contracts.cDai, testAccount)
    const cTusd = CErc20Immutable__factory.connect(
      Contracts.cTUSD,
      testAccount
    );
    const comptroller = Comptroller__factory.connect(
      Contracts.Comptroller,
      testAccount
    );
    await logcTokenBalance(testAccount.address, cTusd)
    await logcEthBalance(testAccount.address, cEth)

    // test account supply ETH to the protocol as collateral (you will get cETH in return)
    await cEth.mint({ value: (1 * 1e18).toString(),});
    await logcEthBalance(testAccount.address, cEth)
    const cEthBalance = await cEth.callStatic.balanceOf(testAccount.address);
    expect(cEthBalance.toNumber()).to.be.greaterThan(0)

    const markets = [Contracts.cEth]; // This is the cToken contract(s) for your collateral
    await (await comptroller.enterMarkets(markets)).wait();
    logCurrentBorrow(testAccount.address, cTusd)
    expect(await getBorrowBalance(testAccount.address, cTusd)).to.be.eq(0)
    
    let underlyingToBorrow = 1.23;
    const scaledUpBorrowAmount = (
      underlyingToBorrow * Math.pow(10, underlyingDecimals)
    ).toString();
    
    await (await cTusd.borrow(scaledUpBorrowAmount)).wait()
    console.log('------- borrow done -----------')
    await logCurrentBorrow(testAccount.address, cTusd)
    let testAccountBalance = await getUnderlysingBalance(testAccount.address, tusd)
    console.log(`testAccountBalance: ${testAccountBalance}`)
    expect(await getBorrowBalance(testAccount.address, cTusd)).to.be.eq(underlyingToBorrow)

    testAccountBalance = await getUnderlysingBalance(testAccount.address, tusd)
    console.log(`testAccountBalance: ${testAccountBalance}`)
    expect(testAccountBalance).to.be.eq(underlyingToBorrow)
    
    const repayAmount = underlyingToBorrow
    // const underlyingToRepay = (repayAmount * Math.pow(10, underlyingDecimals)).toString();
    // const underlyingToRepay = scaledUpBorrowAmount
    await (await tusd.approve(Contracts.cTUSD, scaledUpBorrowAmount)).wait()

    
    await (await cTusd.repayBorrow(scaledUpBorrowAmount)).wait()
    console.log('------- repay borrow done -----------')
    await logCurrentBorrow(testAccount.address, cTusd)
    const finalAmount = await cTusd.callStatic.borrowBalanceCurrent(testAccount.address);
    debugger
    // expect(finalAmount).to.be.eq(BigNumber.from(0))

  });

  it("User could apply cTusd without compound reward", async () => {
    const [testAccount] = await ethers.getSigners();
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

    await logcTokenBalance(testAccount.address, cTusd)
    
    // test account supply tusd to the protocol as collateral (you will get cTusd in return)
    const decimals = await tusd.decimals();
    const tusdAmount = ethers.utils.parseUnits(BigNumber.from(amount).toString(), decimals);
    await (await tusd.approve(cTusd.address, tusdAmount)).wait();
    const mintResult = await (await cTusd.mint(tusdAmount)).wait();  
    let balance_tmp = await cTusd.balanceOf(testAccount.address)
    // let cTokenBalance = await cTusd.callStatic.balanceOf(testAccount.address) / Math.pow(10, underlyingDecimals)
    let cTokenBalance = await cTusd.callStatic.balanceOf(testAccount.address)
    debugger
    expect(cTokenBalance.toNumber()).to.be.greaterThan(0)

    const comp = Comp__factory.connect(Contracts.Comp, testAccount)
    // compare expectedComp with balance of comp
    let balanceOfComp: BigNumber = await comp.balanceOf(testAccount.address)
    console.log('balanceOfComp init reward: ', balanceOfComp.toString())
    expect(balanceOfComp.toNumber()).to.be.lessThanOrEqual(0)

    const latestBlock = await ethers.provider.getBlockNumber();
    const increasedBlocks = 66459
    await advanceBlockTo(latestBlock + increasedBlocks)
    debugger
    // redeem
    await (await cTusd.redeem(balance_tmp)).wait();
    // claim
    await (await comptroller['claimComp(address)'](testAccount.address)).wait()

    balanceOfComp = await comp.balanceOf(testAccount.address)
    expect(balanceOfComp.toNumber()).to.be.eq(0)
  })

  it("User can't borrow cEth with cTusd collateral", async () => {
    const [testAccount] = await ethers.getSigners();
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

    await logcTokenBalance(testAccount.address, cTusd)
    
    // test account supply tusd to the protocol as collateral (you will get cTusd in return)
    const decimals = await tusd.decimals();
    const tusdAmount = ethers.utils.parseUnits(BigNumber.from(amount).toString(), decimals);
    await (await tusd.approve(cTusd.address, tusdAmount)).wait();
    const mintResult = await (await cTusd.mint(tusdAmount)).wait();    

    // cTusd enter market
    const markets = [Contracts.cTUSD]; // This is the cToken contract(s) for your collateral
    await (await comptroller.enterMarkets(markets)).wait();
    logCurrentBorrow(testAccount.address, cTusd)
    
    let underlyingToBorrow = 0.001;
    const scaledUpBorrowAmount = (
      underlyingToBorrow * Math.pow(10, underlyingDecimals)
    ).toString();

    const borrow = await cEth.borrow(ethers.utils.parseEther("0.00123"))
    const borrowResult = await borrow.wait(1);
    const failure = borrowResult?.events?.find(_ => _.event === 'Failure');
    debugger
    expect(failure).to.not.be.a('null')

    let borrowAmount = await getBorrowBalance(testAccount.address, cEth)
    expect(borrowAmount).to.be.lte(0)
  })

  it("User could borrow cDai with cEth collateral", async () => {
    // testAccount is hardhat default account[0]
    const [testAccount] = await ethers.getSigners();
    const cEth = CEther__factory.connect(Contracts.cEth, testAccount);
    const cDai = CErc20Immutable__factory.connect(Contracts.cDai, testAccount);
    const cTusd = CErc20Immutable__factory.connect(
      Contracts.cTUSD,
      testAccount
    );
    const comptroller = Comptroller__factory.connect(
      Contracts.Comptroller,
      testAccount
    );
    // test account supply ETH to the protocol as collateral (you will get cETH in return)
    let mint = await cEth.mint({
      value: (1 * 1e18).toString(),
    });

    // const decimals = await cEth.decimals();
    // const tusdAmount = ethers.utils.parseUnits(BigNumber.from("100").toString(), decimals);
    // await (await cEth.mint()).wait();

    let markets = [Contracts.cEth]; // This is the cToken contract(s) for your collateral
    let enterMarkets = await comptroller.enterMarkets(markets);
    await enterMarkets.wait(1);

    let { 1: liquidity } = await comptroller.callStatic.getAccountLiquidity(
      testAccount.address
    );
    let liquidity_str = (+liquidity / 1e18).toString();
    console.log(
      `\nYou have ${liquidity_str} of LIQUID assets (worth of USD) pooled in the protocol.`
    );
    let cEth_balance = await cEth.balanceOf(testAccount.address);
    console.log("cEth balance before borrow: " + cEth_balance);

    let balance_before = await cDai.callStatic.borrowBalanceCurrent(
      testAccount.address
    );
    console.log("cToken balance before borrow: " + balance_before);

    debugger;
    const underlyingToBorrow = 1.23;
    const scaledUpBorrowAmount = (
      underlyingToBorrow * Math.pow(10, underlyingDecimals)
    ).toString();
    const trx = await cDai.borrow(scaledUpBorrowAmount);
    await trx.wait(1);

    // await (await cDai.borrow(scaledUpBorrowAmount)).wait()
    // console.log('Borrow Transaction', trx);

    cEth_balance = await cEth.balanceOf(testAccount.address);
    console.log("cEth balance after borrow: " + cEth_balance);

    let balance = await cDai.callStatic.borrowBalanceCurrent(
      testAccount.address
    );
    console.log(`cToken after Borrow balance is ${balance}`);

    debugger;
    return balance_before.gt(balance_before);
  });
});

async function transferTusd(amount: number, address: string) {
    let tusd = TrueUsd__factory.connect(Contracts.TUSD, signers.tusdWhale);
    const decimals = await tusd.decimals();
    const tusdAmount = ethers.utils.parseUnits(BigNumber.from(amount).toString(), decimals);
    const testAccountBalance = await tusd.balanceOf(address);
    if (testAccountBalance.lt(tusdAmount)) {
        // tusd whale transfer tusd to test account
        await (await tusd.transfer(address, tusdAmount)).wait();
    }
}

async function logcEthBalance(address:string, cEth:any){
    let cEthBalance = await cEth.callStatic.balanceOf(address) / 1e8;
    let ethBalance = await (await ethers.provider.getBalance(address)).div(1e8)
    console.log("ETH Balance:", ethBalance);
    console.log("cETH Balance:", cEthBalance);
}

async function logcTokenBalance(address:string, cToken: any){
    let cTokenBalance = await cToken.callStatic.balanceOf(address) / Math.pow(10, underlyingDecimals);
    console.log(`cToken Balance:`, cTokenBalance);
}

async function logCurrentBorrow(address:string, cToken: any){
    let balance = await getBorrowBalance(address, cToken)
    console.log(`current borrow balance: ${balance}`)
}

async function getBorrowBalance(address:string, cToken: any){
    let balance = await cToken.callStatic.borrowBalanceCurrent(address);
    balance = balance / Math.pow(10, underlyingDecimals);
    return balance
}

async function getUnderlysingBalance(address:string, underlying:any){
    let balance = await underlying.balanceOf(address);
    balance = balance / Math.pow(10, underlyingDecimals);
    return balance
}

async function getProposalState() {
  let governance = GovernorBravoDelegate__factory.connect(
      Contracts.GovernanceBravo,
      signers.a16z
  );
  const proposal = await governance.proposals(proposalId);
  const state = await governance.state(proposalId);
  return state;
}

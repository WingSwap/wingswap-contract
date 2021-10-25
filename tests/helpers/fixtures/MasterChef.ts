import { MockProvider } from "ethereum-waffle";
import { BigNumber, providers, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  WING__factory,
  WING,
  Stake__factory,
  MasterChef__factory,
  SimpleToken__factory,
  Stake,
  MasterChef,
  SimpleToken,
  MockStakeTokenCallerContract__factory,
  MockStakeTokenCallerContract,
} from "../../../typechain";

export interface IMasterChefUnitTestFixtureDTO {
  WING_START_BLOCK: number;
  WING_PER_BLOCK: BigNumber;
  WING_BONUS_LOCK_UP_BPS: number;
  wingToken: WING;
  stake: Stake;
  masterChef: MasterChef;
  stakingTokens: Array<SimpleToken>;
  mockStakeTokenCaller: MockStakeTokenCallerContract;
}

export interface IMasterChefE2ETestFixtureDTO {
  WING_START_BLOCK: number;
  WING_PER_BLOCK: BigNumber;
  WING_BONUS_LOCK_UP_BPS: number;
  wingToken: WING;
  stake: Stake;
  masterChef: MasterChef;
  stakingTokens: Array<SimpleToken>;
}

export async function masterChefUnitTestFixture(
  maybeWallets?: Wallet[],
  maybeProvider?: MockProvider
): Promise<IMasterChefUnitTestFixtureDTO> {
  const WING_START_BLOCK = 5;
  const WING_PER_BLOCK = ethers.utils.parseEther("10");
  const WING_BONUS_LOCK_UP_BPS = 7000;
  const [deployer, bob, alice, dev] = await ethers.getSigners();
  // Deploy WING
  const WING = (await ethers.getContractFactory("WING", deployer)) as WING__factory;
  const wingToken = await WING.deploy(await dev.getAddress(), 132, 137);
  await wingToken.deployed();

  // Mint WING for testing purpose
  await wingToken.mint(await deployer.getAddress(), ethers.utils.parseEther("888888888"));

  // Deploy Stake
  const Stake = (await ethers.getContractFactory("Stake", deployer)) as Stake__factory;
  const stake = await Stake.deploy(wingToken.address);
  await stake.deployed();

  // Deploy MasterChef
  const MasterChef = (await ethers.getContractFactory("MasterChef", deployer)) as MasterChef__factory;
  const masterChef = (await upgrades.deployProxy(MasterChef, [
    wingToken.address,
    stake.address,
    await dev.getAddress(),
    WING_PER_BLOCK,
    WING_START_BLOCK,
  ])) as MasterChef;

  await masterChef.setPool(wingToken.address, 4000);

  await wingToken.transferOwnership(masterChef.address);
  await stake.transferOwnership(masterChef.address);

  const stakingTokens = [];
  for (let i = 0; i < 4; i++) {
    const SimpleToken = (await ethers.getContractFactory("SimpleToken", deployer)) as SimpleToken__factory;
    const simpleToken = await SimpleToken.deploy(`STOKEN${i}`, `STOKEN${i}`);
    await simpleToken.deployed();
    stakingTokens.push(simpleToken);
  }

  const MockStakeTokenCallerContract = (await ethers.getContractFactory(
    "MockStakeTokenCallerContract",
    deployer
  )) as MockStakeTokenCallerContract__factory;
  const mockStakeTokenCaller = await MockStakeTokenCallerContract.deploy(
    wingToken.address,
    stakingTokens[0].address,
    masterChef.address
  );
  await mockStakeTokenCaller.deployed();

  return {
    WING_START_BLOCK,
    WING_PER_BLOCK,
    WING_BONUS_LOCK_UP_BPS,
    wingToken,
    stake,
    masterChef,
    stakingTokens,
    mockStakeTokenCaller,
  } as IMasterChefUnitTestFixtureDTO;
}

export async function masterChefE2ETestFixture(
  maybeWallets?: Wallet[],
  maybeProvider?: MockProvider
): Promise<IMasterChefE2ETestFixtureDTO> {
  const WING_START_BLOCK = 5;
  const WING_PER_BLOCK = ethers.utils.parseEther("10");
  const WING_BONUS_LOCK_UP_BPS = 7000;
  const [deployer, bob, alice, dev] = await ethers.getSigners();
  // Deploy WING
  const WING = (await ethers.getContractFactory("WING", deployer)) as WING__factory;
  const wingToken = await WING.deploy(await dev.getAddress(), 132, 137);
  await wingToken.deployed();

  // Mint WING for testing purpose
  await wingToken.mint(await deployer.getAddress(), ethers.utils.parseEther("888888888"));

  // Deploy Stake
  const Stake = (await ethers.getContractFactory("Stake", deployer)) as Stake__factory;
  const stake = await Stake.deploy(wingToken.address);
  await stake.deployed();

  // Deploy MasterChef
  const MasterChef = (await ethers.getContractFactory("MasterChef", deployer)) as MasterChef__factory;
  const masterChef = (await upgrades.deployProxy(MasterChef, [
    wingToken.address,
    stake.address,
    await dev.getAddress(),
    WING_PER_BLOCK,
    WING_START_BLOCK,
  ])) as MasterChef;
  await masterChef.deployed();

  await masterChef.setPool(wingToken.address, 4000);

  await wingToken.transferOwnership(masterChef.address);
  await stake.transferOwnership(masterChef.address);

  const stakingTokens = [];
  for (let i = 0; i < 4; i++) {
    const SimpleToken = (await ethers.getContractFactory("SimpleToken", deployer)) as SimpleToken__factory;
    const simpleToken = await SimpleToken.deploy(`STOKEN${i}`, `STOKEN${i}`);
    await simpleToken.deployed();
    stakingTokens.push(simpleToken);
  }

  return {
    WING_START_BLOCK,
    WING_PER_BLOCK,
    WING_BONUS_LOCK_UP_BPS,
    wingToken,
    stake,
    masterChef,
    stakingTokens,
  } as IMasterChefE2ETestFixtureDTO;
}

import {
  WingNFT__factory,
  WingNFT,
  MockWBNB__factory,
  WNativeRelayer__factory,
  SimpleToken__factory,
  SimpleToken,
  Stake__factory,
  WING__factory,
  Stake,
  WING,
  MockWBNB,
  WNativeRelayer,
  OGOwnerToken,
  MasterChef,
} from "../../../typechain";
import { ethers, upgrades } from "hardhat";
import { smoddit, ModifiableContract } from "@eth-optimism/smock";
import { BigNumber, constants } from "ethers";

export interface IWingNFTUnitTestFixtureDTO {
  wingNFT: WingNFT;
  wbnb: MockWBNB;
  wNativeRelayer: WNativeRelayer;
  stakingTokens: Array<SimpleToken>;
  masterChef: ModifiableContract;
  stake: Stake;
  wingToken: WING;
  WING_START_BLOCK: number;
  WING_PER_BLOCK: BigNumber;
  ogOwnerToken: ModifiableContract;
}

export async function wingNFTUnitTestFixture(): Promise<IWingNFTUnitTestFixtureDTO> {
  const WING_START_BLOCK = 5;
  const WING_PER_BLOCK = ethers.utils.parseEther("10");
  const [deployer, alice, bob, dev] = await ethers.getSigners();
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
  const MasterChef = await smoddit("MasterChef", deployer);
  const masterChef: ModifiableContract = await MasterChef.deploy();
  await (masterChef as unknown as MasterChef).initialize(
    wingToken.address,
    stake.address,
    await dev.getAddress(),
    WING_PER_BLOCK,
    WING_START_BLOCK
  );
  await wingToken.transferOwnership(masterChef.address);
  await stake.transferOwnership(masterChef.address);

  // Deploy mocked stake tokens
  const stakingTokens = [];
  for (let i = 0; i < 4; i++) {
    const SimpleToken = (await ethers.getContractFactory("SimpleToken", deployer)) as SimpleToken__factory;
    const simpleToken = (await SimpleToken.deploy(`STOKEN${i}`, `STOKEN${i}`)) as SimpleToken;
    await simpleToken.deployed();
    stakingTokens.push(simpleToken);
  }
  const WBNB = (await ethers.getContractFactory("MockWBNB", deployer)) as MockWBNB__factory;
  const wbnb = await WBNB.deploy();
  await wbnb.deployed();

  const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
  const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
  await await wNativeRelayer.deployed();
  // Deploy OG Owner Token
  const OGOwnerToken = await smoddit("OGOwnerToken", deployer);
  const ogOwnerToken: ModifiableContract = await OGOwnerToken.deploy();
  await (ogOwnerToken as unknown as OGOwnerToken).initialize("OGOWNERTOKEN", "OGOWNERTOKEN", constants.AddressZero);
  // Deploy WingNFT
  const WingNFT = (await ethers.getContractFactory("WingNFT", deployer)) as WingNFT__factory;
  const wingNFT = (await upgrades.deployProxy(WingNFT, ["baseURI", wingToken.address, masterChef.address], {
    initializer: "initialize(string,address,address)",
  })) as WingNFT;
  await wingNFT.deployed();
  await wingNFT.setCategoryOGOwnerToken(0, ogOwnerToken.address);

  await (ogOwnerToken as unknown as OGOwnerToken).setOkHolders([wingNFT.address, masterChef.address], true);
  await (ogOwnerToken as unknown as OGOwnerToken).transferOwnership(wingNFT.address);

  await masterChef.smodify.put({
    stakeTokenCallerAllowancePool: {
      [ogOwnerToken.address]: true,
    },
  });

  await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(ogOwnerToken.address, wingNFT.address);
  await (masterChef as unknown as MasterChef).addPool(ogOwnerToken.address, "1000");

  return {
    wingNFT,
    wNativeRelayer,
    wbnb,
    stakingTokens,
    masterChef,
    stake,
    wingToken,
    WING_START_BLOCK,
    WING_PER_BLOCK,
    ogOwnerToken,
  } as IWingNFTUnitTestFixtureDTO;
}

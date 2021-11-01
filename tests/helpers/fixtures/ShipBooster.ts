import { MockProvider } from "ethereum-waffle";
import { BigNumber, Signer, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  Stake,
  Stake__factory,
  ShipBooster,
  ShipBooster__factory,
  WING,
  WING__factory,
  SimpleToken,
  SimpleToken__factory,
  MockWBNB,
  MockWBNB__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
  ShipBoosterConfig,
  MasterChef,
  WingSwapNFT,
} from "../../../typechain";
import { ModifiableContract, smoddit } from "@eth-optimism/smock";
import { zeroAddress } from "ethereumjs-util";

export interface IShipBoosterUnitTestFixtureDTO {
  WING_START_BLOCK: number;
  WING_PER_BLOCK: BigNumber;
  shipbooster: ShipBooster;
  masterChef: ModifiableContract;
  shipboosterConfig: ModifiableContract;
  stakingTokens: Array<SimpleToken>;
  wingToken: WING;
  nftToken: ModifiableContract;
  stake: Stake;
  wbnb: MockWBNB;
  wNativeRelayer: WNativeRelayer;
  wingswapNft: ModifiableContract;
  signatureFn: (signer: Signer, msg?: string) => Promise<string>;
}

export async function shipboosterUnitTestFixture(
  maybeWallets?: Wallet[],
  maybeProvider?: MockProvider
): Promise<IShipBoosterUnitTestFixtureDTO> {
  const WING_START_BLOCK = 5;
  const WING_PER_BLOCK = ethers.utils.parseEther("10");
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

  // Deploy mocked MasterChef
  const MasterChef = await smoddit("MasterChef", deployer);
  const masterChef: ModifiableContract = await MasterChef.deploy();
  await (masterChef as unknown as MasterChef).initialize(
    wingToken.address,
    stake.address,
    await dev.getAddress(),
    zeroAddress(),
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

  // Deploy mocked ERC-721
  const MockERC721 = await smoddit("MockERC721", deployer);
  const mockERC721: ModifiableContract = await MockERC721.deploy(`NFT`, `NFT`);

  const WingSwapNft = await smoddit("WingSwapNFT", deployer);
  const wingswapNft = await WingSwapNft.deploy();
  await (wingswapNft as unknown as WingSwapNFT).initialize("baseURI");
  await wingswapNft.smodify.put({
    wingswapNFTToCategory: {
      0: 1,
    },
  });

  // Deploy mocked shipbooster config
  const ShipBoosterConfigFactory = await smoddit("ShipBoosterConfig", deployer);
  const mockShipBoosterConfig = await ShipBoosterConfigFactory.deploy();
  await (mockShipBoosterConfig as unknown as ShipBoosterConfig).initialize();

  const WBNB = (await ethers.getContractFactory("MockWBNB", deployer)) as MockWBNB__factory;
  const wbnb = await WBNB.deploy();
  await wbnb.deployed();

  const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
  const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
  await await wNativeRelayer.deployed();

  // Deploy ShipBooster
  const ShipBooster = (await ethers.getContractFactory("ShipBooster", deployer)) as ShipBooster__factory;
  const shipbooster = (await upgrades.deployProxy(ShipBooster, [
    wingToken.address,
    masterChef.address,
    mockShipBoosterConfig.address,
    wNativeRelayer.address,
    wbnb.address,
  ])) as ShipBooster;
  await shipbooster.deployed();

  await wNativeRelayer.setCallerOk([shipbooster.address], true);

  const signatureFn = async (signer: Signer, msg = "I am an EOA"): Promise<string> => {
    return await signer.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(msg))));
  };

  return {
    WING_PER_BLOCK,
    WING_START_BLOCK,
    shipbooster,
    masterChef: masterChef,
    shipboosterConfig: mockShipBoosterConfig,
    stakingTokens,
    wingToken,
    nftToken: mockERC721,
    stake,
    signatureFn,
    wbnb,
    wNativeRelayer,
    wingswapNft,
  } as IShipBoosterUnitTestFixtureDTO;
}

import { MockProvider } from "ethereum-waffle";
import { BigNumber, Signer, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  SimpleToken,
  SimpleToken__factory,
  MockWBNB,
  MockWBNB__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
  WBNB,
  WingMarket__factory,
  WingMarket,
  WingSwapNFT,
} from "../../../typechain";
import { ModifiableContract, smoddit } from "@eth-optimism/smock";
import { latestBlockNumber } from "../time";

export interface IWingMarketUnitTestFixtureDTO {
  FEE_ADDR: string;
  FEE_BPS: number;
  stakingTokens: Array<SimpleToken>;
  wbnb: MockWBNB;
  wNativeRelayer: WNativeRelayer;
  wingswapNFT: ModifiableContract;
  wingMarket: WingMarket;
  startingBlock: BigNumber;
  signatureFn: (signer: Signer, msg?: string) => Promise<string>;
}

export async function wingMarketUnitTestFixture(
  maybeWallets?: Wallet[],
  maybeProvider?: MockProvider
): Promise<IWingMarketUnitTestFixtureDTO> {
  const [deployer, bob, alice, dev] = await ethers.getSigners();
  const FEE_ADDR = await dev.getAddress();
  const FEE_BPS = 1000;

  // Deploy WingSwapNFT
  const WingSwapNFT = await smoddit("WingSwapNFT", deployer);
  const wingswapNFT = await WingSwapNFT.deploy();
  await (wingswapNFT as unknown as WingSwapNFT).initialize("baseURI");

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

  const WingMarket = (await ethers.getContractFactory("WingMarket", deployer)) as WingMarket__factory;
  const wingMarket = (await upgrades.deployProxy(WingMarket, [
    FEE_ADDR,
    FEE_BPS,
    wNativeRelayer.address,
    wbnb.address,
  ])) as WingMarket;
  await wingMarket.deployed();

  await wNativeRelayer.setCallerOk([wingMarket.address], true);

  const signatureFn = async (signer: Signer, msg = "I am an EOA"): Promise<string> => {
    return await signer.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(msg))));
  };

  const startingBlock = await latestBlockNumber();

  return {
    stakingTokens,
    signatureFn,
    wbnb,
    wNativeRelayer,
    wingswapNFT,
    wingMarket,
    startingBlock,
  } as IWingMarketUnitTestFixtureDTO;
}

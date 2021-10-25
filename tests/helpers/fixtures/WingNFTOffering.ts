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
  WingSwapNFT,
} from "../../../typechain";
import { ModifiableContract, smoddit } from "@eth-optimism/smock";
import { latestBlockNumber } from "../time";
import { WingNFTOffering__factory } from "../../../typechain/factories/WingNFTOffering__factory";
import { WingNFTOffering } from "../../../typechain/WingNFTOffering";
import { parseEther } from "@ethersproject/units";

export interface IOgOfferingUnitTestFixtureDTO {
  FEE_ADDR: string;
  FEE_BPS: number;
  stakingTokens: Array<SimpleToken>;
  wbnb: MockWBNB;
  wNativeRelayer: WNativeRelayer;
  wingNFT: ModifiableContract;
  ogOffering: WingNFTOffering;
  startingBlock: BigNumber;
  priceModel: ModifiableContract;
  signatureFn: (signer: Signer, msg?: string) => Promise<string>;
}

export async function ogOfferingUnitTestFixture(
  maybeWallets?: Wallet[],
  maybeProvider?: MockProvider
): Promise<IOgOfferingUnitTestFixtureDTO> {
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

  const TripleSlopeModel = await smoddit("TripleSlopePriceModel", deployer);
  const priceModel = await TripleSlopeModel.deploy([
    {
      categoryId: 0,
      price: parseEther("1.61"),
      slope: 10000,
    },
    {
      categoryId: 0,
      price: parseEther("2.69"),
      slope: 5000,
    },
    {
      categoryId: 0,
      price: parseEther("3.59"),
      slope: 2000,
    },
  ]);
  await priceModel.deployed();

  const WingNFTOffering = (await ethers.getContractFactory("WingNFTOffering", deployer)) as WingNFTOffering__factory;
  const ogOffering = (await upgrades.deployProxy(WingNFTOffering, [
    wingswapNFT.address,
    FEE_ADDR,
    FEE_BPS,
    wNativeRelayer.address,
    wbnb.address,
    priceModel.address,
  ])) as WingNFTOffering;
  await ogOffering.deployed();

  await (wingswapNFT as unknown as WingSwapNFT).grantRole(await wingswapNFT.MINTER_ROLE(), ogOffering.address);

  await wNativeRelayer.setCallerOk([ogOffering.address], true);

  const signatureFn = async (signer: Signer, msg = "I am an EOA"): Promise<string> => {
    return await signer.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(msg))));
  };

  const startingBlock = await latestBlockNumber();

  return {
    stakingTokens,
    signatureFn,
    wbnb,
    wNativeRelayer,
    wingNFT: wingswapNFT,
    ogOffering,
    startingBlock,
    priceModel,
  } as IOgOfferingUnitTestFixtureDTO;
}

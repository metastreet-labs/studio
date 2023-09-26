import { Inject } from '@nestjs/common';
import { BigNumberish, BigNumber, constants } from 'ethers';
import { gql } from 'graphql-request';
import { sumBy } from 'lodash';

import { APP_TOOLKIT, IAppToolkit } from '~app-toolkit/app-toolkit.interface';
import { PositionTemplate } from '~app-toolkit/decorators/position-template.decorator';
import { gqlFetch } from '~app-toolkit/helpers/the-graph.helper';
import { ZERO_ADDRESS } from '~app-toolkit/constants/address';
import { drillBalance } from '~app-toolkit/helpers/drill-balance.helper';

import { ContractPositionTemplatePositionFetcher } from '~position/template/contract-position.template.position-fetcher';
import {
  GetDefinitionsParams,
  GetTokenDefinitionsParams,
  UnderlyingTokenDefinition,
  GetDisplayPropsParams,
  GetTokenBalancesParams,
  GetDataPropsParams,
} from '~position/template/contract-position.template.types';
import { ContractPositionBalance } from '~position/position-balance.interface';
import { ContractPosition, MetaType } from '~position/position.interface';

import { MetastreetContractFactory, Pool, PoolLegacy } from '../contracts';

export const GET_POOLS_QUERY = gql`
  {
    pools {
      implementationVersionMajor
      id
      ticks {
        id
        limit
        duration
        rate
        raw
      }
      currencyToken {
        symbol
      }
      collateralToken {
        name
      }
    }
  }
`;

function getAllDepositsQuery(address: string) {
  return gql`
    {
      pools {
        deposits(where: { account: "${address}" }) {
          shares
          tick {
            id
            value
            shares
          }
          redemptions {
            shares
          }
        }
      }
    }
  `;
}

export type GetPoolsResponse = {
  pools: {
    id: string;
    implementationVersionMajor: string;
    ticks: {
      id: string;
      limit: BigNumber;
      duration: BigNumber;
      rate: BigNumber;
      raw: BigNumber;
    }[];
    currencyToken: string;
    collateralToken: string;
  }[];
};

export type GetAllDepositsResponse = {
  pools: {
    deposits: {
      shares: BigNumber;
      tick: {
        id: string;
        shares: BigNumber;
        value: BigNumber;
      };
      redemptions: {
        shares: BigNumber;
      }[];
    }[];
  }[];
};

export const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/metastreet-labs/metastreet-v2-beta';

/* Block number of the creation of pool factory */
export const START_BLOCK_NUMBER = 17497132;

export type ContractPositionDefinition = {
  implementationVersionMajor: string;
  address: string;
  tickId: string;
  tick: BigNumber;
  limit: BigNumber;
  duration: BigNumber;
  rate: BigNumber;
  currencyTokenSymbol: string;
  collateralTokenName: string;
};

export type DataProps = {
  positionKey: string;
  tick: BigNumber; // encoded tick
  implementationVersionMajor: string;
};

export type Deposited = {
  amount: BigNumber;
  shares: BigNumber;
};

export type Withdrawn = {
  amount: BigNumber;
  shares: BigNumber;
};

export type Redemption = {
  amount: BigNumber;
  shares: BigNumber;
};

@PositionTemplate()
export class EthereumMetastreetLendingV2ContractPositionFetcher extends ContractPositionTemplatePositionFetcher<Pool> {
  groupLabel: string = 'Lending';

  constructor(
    @Inject(APP_TOOLKIT) protected readonly appToolkit: IAppToolkit,
    @Inject(MetastreetContractFactory) protected readonly metastreetContractFactory: MetastreetContractFactory,
  ) {
    super(appToolkit);
  }

  getContract(_address: string): Pool {
    return this.metastreetContractFactory.pool({ address: _address, network: this.network });
  }

  getLegacyContract(_address: string): PoolLegacy {
    return this.metastreetContractFactory.poolLegacy({ address: _address, network: this.network });
  }

  async getDefinitions(_params: GetDefinitionsParams): Promise<ContractPositionDefinition[]> {
    const data = await gqlFetch<GetPoolsResponse>({
      endpoint: SUBGRAPH_URL,
      query: GET_POOLS_QUERY,
    });

    return data.pools.flatMap(p => {
      return p.ticks.map(t => ({
        implementationVersionMajor: p.implementationVersionMajor,
        address: p.id,
        tickId: t.id,
        tick: t.raw,
        limit: t.limit,
        duration: t.duration,
        rate: t.rate,
        currencyTokenSymbol: p.currencyToken['symbol'],
        collateralTokenName: p.collateralToken['name'],
      }));
    });
  }

  async getTokenDefinitions(
    _params: GetTokenDefinitionsParams<Pool, ContractPositionDefinition>,
  ): Promise<UnderlyingTokenDefinition[] | null> {
    const pool: Pool = _params.contract;
    return [
      {
        metaType: MetaType.SUPPLIED,
        address: await pool.currencyToken(),
        network: this.network,
      },
      {
        metaType: MetaType.CLAIMABLE,
        address: await pool.currencyToken(),
        network: this.network,
      },
    ];
  }

  async getDataProps(_params: GetDataPropsParams<Pool, DataProps, ContractPositionDefinition>): Promise<DataProps> {
    return {
      positionKey: _params.definition.tickId,
      tick: _params.definition.tick,
      implementationVersionMajor: _params.definition.implementationVersionMajor,
    };
  }

  async getLabel(_params: GetDisplayPropsParams<Pool, DataProps, ContractPositionDefinition>): Promise<string> {
    const collateralTokenName: string = _params.definition.collateralTokenName; // e.g. Wrapped Cryptopunks
    const currencyTokenSymbol: string = _params.definition.currencyTokenSymbol; // e.g. WETH
    const duration: string = BigNumber.from(_params.definition.duration).lt(86400)
      ? '0'
      : BigNumber.from(_params.definition.duration).div(86400).mask(17).toString(); // round to closest days
    const limit: number = BigNumber.from(_params.definition.limit).lt(1e15)
      ? 0
      : BigNumber.from(_params.definition.limit).div(1e15).toNumber() / 1000;
    const apr: BigNumber = BigNumber.from(_params.definition.rate).mul(365 * 86400);
    const rate: number = Math.round(apr.lt(1e15) ? 0 : apr.div(1e15).toNumber() / 10);
    const labelPrefix =
      collateralTokenName && currencyTokenSymbol ? `${collateralTokenName} / ${currencyTokenSymbol} - ` : '';

    // e.g. "Wrapped Cryptopunks / DAI - 30 Day, 10%, 630000 DAI"
    return `${labelPrefix}${duration} Day, ${rate}%, ${limit} ${currencyTokenSymbol}`;
  }

  async getPositionsForBalances() {
    return this.appToolkit.getAppContractPositions<DataProps>({
      appId: this.appId,
      network: this.network,
      groupIds: [this.groupId],
    });
  }

  async getBalances(_address: string): Promise<ContractPositionBalance<DataProps>[]> {
    const multicall = this.appToolkit.getMulticall(this.network);
    const address = await this.getAccountAddress(_address);
    if (address === ZERO_ADDRESS) return [];

    /* Get ticks that the account has interacted with */
    const data = await gqlFetch<GetAllDepositsResponse>({
      endpoint: SUBGRAPH_URL,
      query: getAllDepositsQuery(address),
    });

    /* Tick IDs */
    const ticks = new Set();

    /* Add active positions to the set of tick IDs */
    data.pools.forEach(p => {
      p.deposits.forEach(d => {
        /* Only add a position if user shares is non-zero */
        if (
          !BigNumber.from(d.shares).eq(constants.Zero) ||
          d.redemptions.some(r => !BigNumber.from(r.shares).eq(constants.Zero))
        ) {
          ticks.add(d.tick.id);
        }
      });
    });

    /* Get all positions from all pools */
    const contractPositions = await this.getPositionsForBalances();

    /* Filter out positions based on account's active positions */
    const filteredPositions = contractPositions.filter(cp => ticks.has(cp.dataProps.positionKey));

    const balances = await Promise.all(
      filteredPositions.map(async contractPosition => {
        const contract = multicall.wrap(this.getContract(contractPosition.address));
        const balancesRaw = await this.getTokenBalancesPerPosition({ address, contract, contractPosition, multicall });
        const allTokens = contractPosition.tokens.map((cp, idx) =>
          drillBalance(cp, balancesRaw[idx]?.toString() ?? '0', { isDebt: cp.metaType === MetaType.BORROWED }),
        );

        const tokens = allTokens.filter(v => Math.abs(v.balanceUSD) > 0.01);
        const balanceUSD = sumBy(tokens, t => t.balanceUSD);

        const balance = { ...contractPosition, tokens, balanceUSD };
        return balance;
      }),
    );
    return balances;
  }

  async getTokenBalancesPerPosition(_params: GetTokenBalancesParams<Pool, DataProps>): Promise<BigNumberish[]> {
    const contract: Pool = _params.contract;
    const tick: BigNumber = _params.contractPosition.dataProps.tick;
    const account: string = _params.address;
    const implementationVersionMajor: string = _params.contractPosition.dataProps.implementationVersionMajor;

    /* Get account's deposit logs and compute deposited amount and received shares */
    const depositLogs = await contract.queryFilter(contract.filters.Deposited(account, tick), START_BLOCK_NUMBER);
    const deposited: Deposited = depositLogs.reduce(
      (deposited: Deposited, l) => {
        if (l.args.tick.eq(tick) && l.args.account.toLowerCase() === account) {
          return { amount: deposited.amount.add(l.args.amount), shares: deposited.shares.add(l.args.shares) };
        } else {
          return deposited;
        }
      },
      { amount: constants.Zero, shares: constants.Zero },
    );

    /* Get account's withdrawal logs and compute withdrawn amount and burned shares */
    let firstDepositBlockNumber: number = depositLogs.length > 0 ? depositLogs[0].blockNumber : START_BLOCK_NUMBER;
    const withdrawLogs = await contract.queryFilter(contract.filters.Withdrawn(account, tick), firstDepositBlockNumber);
    const withdrawn: Withdrawn = withdrawLogs.reduce(
      (withdrawn: Withdrawn, l) => {
        if (l.args.tick.eq(tick) && l.args.account.toLowerCase() === account) {
          return { amount: withdrawn.amount.add(l.args.amount), shares: withdrawn.shares.add(l.args.shares) };
        } else {
          return withdrawn;
        }
      },
      { amount: constants.Zero, shares: constants.Zero },
    );

    let redeemed: Redemption = { amount: constants.Zero, shares: constants.Zero };
    /* Legacy implementation does not have latest deposits API */
    if (implementationVersionMajor === '1') {
      /* Get legacy pool interface */
      const legacyPool = this.getLegacyContract(contract.address);

      /* Get redemption available */
      const redemptionAvailable = await legacyPool.redemptionAvailable(account, tick);
      redeemed = { amount: redemptionAvailable.amount, shares: redemptionAvailable.shares };
    } else {
      /* Get redemption ID from account's deposit */
      const deposit = await contract.deposits(account, tick);

      /* Multicall redemption available and compute total amount and shares */
      const redemptionIds = Array.from({ length: deposit.redemptionId.toNumber() }, (_, index) => index + 1);
      const pool = _params.multicall.wrap(contract);
      const redemptionsAvailable = await Promise.all(
        redemptionIds.map(async id => await pool.redemptionAvailable(account, tick, BigNumber.from(id))),
      );
      redeemed = redemptionsAvailable.reduce(
        (redemptionAvailable, { amount, shares }) => ({
          amount: redemptionAvailable.amount.add(amount),
          shares: redemptionAvailable.shares.add(shares),
        }),
        { amount: constants.Zero, shares: constants.Zero },
      );
    }

    /* Compute active shares in tick */
    const activeShares = deposited.shares.sub(redeemed.shares).sub(withdrawn.shares);

    /* Compute current position balance from tick data in addition to redeemed amount available */
    const tickData = await contract.liquidityNode(tick);
    const currentPosition = tickData.shares.eq(constants.Zero)
      ? redeemed.amount
      : activeShares.mul(tickData.value).div(tickData.shares).add(redeemed.amount);

    /* Compute deposit position (deposit shares * depositor's avg share price - withdrawn amount) */
    const depositPosition = deposited.shares.mul(deposited.amount).div(deposited.shares).sub(withdrawn.amount);

    /* Compute supplied and claimable balances */
    const suppliedBalance = depositPosition.gt(currentPosition) ? currentPosition : depositPosition;
    const claimableBalance = depositPosition.gt(currentPosition)
      ? constants.Zero
      : currentPosition.sub(depositPosition);

    return [suppliedBalance, claimableBalance];
  }
}

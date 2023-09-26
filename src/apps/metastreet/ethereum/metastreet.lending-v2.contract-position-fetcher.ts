import { Inject } from '@nestjs/common';
import { BigNumberish, BigNumber, ethers } from 'ethers';
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

import { MetastreetContractFactory, Pool } from '../contracts';
import { DefaultDataProps } from '~position/display.interface';

export const GET_POOLS_QUERY = gql`
  {
    pools {
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

function getDepositsQuery(address: string, pool: string) {
  return gql`
    {
      pool(id: "${pool}") {
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

export type GetDepositsResponse = {
  pool: {
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
  };
};

export const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/metastreet-labs/metastreet-v2-beta';

export type ContractPositionDefinition = {
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
  positionKey: string; // tick id
  tick: BigNumber; // encoded tick
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

  async getDefinitions(_params: GetDefinitionsParams): Promise<ContractPositionDefinition[]> {
    const data = await gqlFetch<GetPoolsResponse>({
      endpoint: SUBGRAPH_URL,
      query: GET_POOLS_QUERY,
    });

    return data.pools.flatMap(p => {
      return p.ticks.map(t => ({
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
        metaType: MetaType.CLAIMABLE,
        address: await pool.currencyToken(),
        network: this.network,
      },
    ];
  }

  async getDataProps(_params: GetDataPropsParams<Pool, DataProps, ContractPositionDefinition>): Promise<DataProps> {
    return {
      positionKey: `${_params.definition.tickId}`,
      tick: _params.definition.tick,
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

  async getBalances(_address: string): Promise<ContractPositionBalance<DefaultDataProps>[]> {
    const address = await this.getAccountAddress(_address);
    if (address === ZERO_ADDRESS) return [];

    /* Get ticks that the account has interacted with */
    const data = await gqlFetch<GetAllDepositsResponse>({
      endpoint: SUBGRAPH_URL,
      query: getAllDepositsQuery(address),
    });

    /* tick id as key, balances as value */
    const tickBalances = {};

    /* compute account balance for each tick and add an entry to tickBalances */
    data.pools.forEach(p => {
      p.deposits.forEach(d => {
        const tickShares = BigNumber.from(d.tick.shares);
        const tickValue = BigNumber.from(d.tick.value);
        const redeemedShares = BigNumber.from(
          d.redemptions.reduce((partialSum, r) => partialSum.add(r.shares), ethers.constants.Zero),
        );
        const userShares = BigNumber.from(d.shares).add(redeemedShares);
        const balance = tickShares.eq(ethers.constants.Zero)
          ? ethers.constants.Zero
          : tickValue.mul(userShares).div(tickShares);

        /* only add an etnry if balance is non-zero */
        if (balance.gt(ethers.constants.Zero)) {
          tickBalances[d.tick.id] = [balance];
        }
      });
    });

    /* Get all positions from all pools */
    const contractPositions = await this.getPositionsForBalances();

    /* Filter out positions based on account's tick balances */
    const filteredPositions = contractPositions.reduce(
      (positions: [ContractPosition, BigNumber][], cp: ContractPosition<DataProps>) => {
        if (cp.dataProps.positionKey in tickBalances) {
          positions.push([cp, tickBalances[cp.dataProps.positionKey]]);
        }
        return positions;
      },
      [],
    );

    const balances = await Promise.all(
      filteredPositions.map(async contractPositionAndBalance => {
        const [contractPosition, balancesRaw] = contractPositionAndBalance;
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
    const data = await gqlFetch<GetDepositsResponse>({
      endpoint: SUBGRAPH_URL,
      query: getDepositsQuery(_params.address, _params.contractPosition.address),
    });
    let balance = ethers.constants.Zero;
    data.pool.deposits.forEach(d => {
      if (d.tick.id === _params.contractPosition.dataProps.positionKey) {
        const tickShares = BigNumber.from(d.tick.shares);
        const tickValue = BigNumber.from(d.tick.value);
        const redeemedShares = BigNumber.from(
          d.redemptions.reduce((partialSum, r) => partialSum.add(r.shares), ethers.constants.Zero),
        );
        const userShares = BigNumber.from(d.shares).add(redeemedShares);
        balance = balance.add(
          tickShares.eq(ethers.constants.Zero) ? ethers.constants.Zero : tickValue.mul(userShares).div(tickShares),
        );
      }
    });
    return [balance];
  }
}

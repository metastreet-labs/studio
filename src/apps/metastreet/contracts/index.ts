import { Injectable, Inject } from '@nestjs/common';

import { IAppToolkit, APP_TOOLKIT } from '~app-toolkit/app-toolkit.interface';
import { ContractFactory } from '~contract/contracts';
import { Network } from '~types/network.interface';

import { Pool__factory, PoolLegacy__factory } from './ethers';

// eslint-disable-next-line
type ContractOpts = { address: string; network: Network };

@Injectable()
export class MetastreetContractFactory extends ContractFactory {
  constructor(@Inject(APP_TOOLKIT) protected readonly appToolkit: IAppToolkit) {
    super((network: Network) => appToolkit.getNetworkProvider(network));
  }

  pool({ address, network }: ContractOpts) {
    return Pool__factory.connect(address, this.appToolkit.getNetworkProvider(network));
  }
  poolLegacy({ address, network }: ContractOpts) {
    return PoolLegacy__factory.connect(address, this.appToolkit.getNetworkProvider(network));
  }
}

export type { Pool } from './ethers';
export type { PoolLegacy } from './ethers';

import { Module } from '@nestjs/common';

import { AbstractApp } from '~app/app.dynamic-module';

import { MetastreetContractFactory } from './contracts';
import { EthereumMetastreetLendingV2ContractPositionFetcher } from './ethereum/metastreet.lending-v2.contract-position-fetcher';

@Module({
  providers: [EthereumMetastreetLendingV2ContractPositionFetcher, MetastreetContractFactory],
})
export class MetastreetAppModule extends AbstractApp() {}

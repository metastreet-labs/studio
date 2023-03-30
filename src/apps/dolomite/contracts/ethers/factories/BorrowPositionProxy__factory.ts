/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Signer, utils } from 'ethers';
import type { Provider } from '@ethersproject/providers';
import type { BorrowPositionProxy, BorrowPositionProxyInterface } from '../BorrowPositionProxy';

const _abi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'dolomiteMargin',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: '_borrower',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: '_borrowAccountIndex',
        type: 'uint256',
      },
    ],
    name: 'BorrowPositionOpen',
    type: 'event',
  },
  {
    constant: true,
    inputs: [],
    name: 'DOLOMITE_MARGIN',
    outputs: [
      {
        internalType: 'contract IDolomiteMargin',
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        internalType: 'uint256',
        name: '_borrowAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_toAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256[]',
        name: '_collateralMarketIds',
        type: 'uint256[]',
      },
    ],
    name: 'closeBorrowPosition',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        internalType: 'uint256',
        name: '_fromAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_toAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_marketId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_amountWei',
        type: 'uint256',
      },
      {
        internalType: 'enum AccountBalanceHelper.BalanceCheckFlag',
        name: '_balanceCheckFlag',
        type: 'uint8',
      },
    ],
    name: 'openBorrowPosition',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        internalType: 'uint256',
        name: '_fromAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_borrowAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_marketId',
        type: 'uint256',
      },
      {
        internalType: 'enum AccountBalanceHelper.BalanceCheckFlag',
        name: '_balanceCheckFlag',
        type: 'uint8',
      },
    ],
    name: 'repayAllForBorrowPosition',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        internalType: 'uint256',
        name: '_fromAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_toAccountIndex',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_marketId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_amountWei',
        type: 'uint256',
      },
      {
        internalType: 'enum AccountBalanceHelper.BalanceCheckFlag',
        name: '_balanceCheckFlag',
        type: 'uint8',
      },
    ],
    name: 'transferBetweenAccounts',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export class BorrowPositionProxy__factory {
  static readonly abi = _abi;
  static createInterface(): BorrowPositionProxyInterface {
    return new utils.Interface(_abi) as BorrowPositionProxyInterface;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): BorrowPositionProxy {
    return new Contract(address, _abi, signerOrProvider) as BorrowPositionProxy;
  }
}

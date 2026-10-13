# dvp-settlement

Settle a trade delivery-versus-payment on Hedera: the security leg and the stablecoin leg move in one scheduled native `TransferTransaction`, or neither moves. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → Settle a trade delivery-versus-payment in one atomic transfer**.

```bash
npx create-scaffold-hbar@latest --template web3buidlerz/hedera-finance-templates#templates/dvp-settlement
```

> Work in progress: this branch is the Next.js starter the DvP app is being built on.

```bash
yarn install
yarn next:dev   # http://localhost:3000
```

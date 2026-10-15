"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { BondOverviewCard } from "~~/components/coupons/BondOverviewCard";
import { CouponHistoryCard } from "~~/components/coupons/CouponHistoryCard";
import { IssueBondForm } from "~~/components/coupons/IssueBondForm";
import { PositionsFundingCard } from "~~/components/coupons/PositionsFundingCard";
import { ScheduleControlsCard } from "~~/components/coupons/ScheduleControlsCard";
import { SetupCard } from "~~/components/coupons/SetupCard";
import { WalletInvestorCard } from "~~/components/coupons/WalletInvestorCard";
import { useBond } from "~~/hooks/coupons/useBond";
import { useDeskState } from "~~/hooks/coupons/useDeskState";

const Home: NextPage = () => {
  const desk = useDeskState();
  const { isConnected } = useAccount();
  const [localBond, setLocalBond] = useState<`0x${string}` | undefined>(undefined);
  const [walletInvestor, setWalletInvestor] = useState<{ evmAddress: `0x${string}` } | null>(null);

  const bondAddress = localBond ?? desk.data?.currentBond ?? undefined;
  const bond = useBond(bondAddress);

  useEffect(() => {
    if (!isConnected) setWalletInvestor(null);
  }, [isConnected]);

  return (
    <div className="flex flex-col grow">
      <div className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal w-full py-10 px-5">
        <div className="max-w-5xl mx-auto flex flex-col gap-2 text-white">
          <h1 className="text-2xl font-bold m-0">Coupon bonds that pay themselves</h1>
          <p className="max-w-3xl text-sm text-white/90 m-0">
            A bond coupon is a periodic interest payment. Usually something off-chain has to trigger it -- a paying
            agent, or on other chains a keeper network such as Chainlink Automation. Here the bond schedules its own
            payments through the Hedera Schedule Service (HIP-1215): once started, the contract calls itself back at
            every coupon date, pays every holder in an HTS stablecoin, and schedules its own next coupon. No keeper,
            bot, cron job or off-chain automation is involved.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-5 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
          <SetupCard desk={desk.data} onDone={() => desk.refetch()} />
          <IssueBondForm
            desk={desk.data}
            onIssued={address => {
              setLocalBond(address);
              desk.refetch();
            }}
          />
          <PositionsFundingCard
            bondAddress={bondAddress}
            bond={bond.data}
            investors={desk.data?.investors ?? []}
            walletInvestor={walletInvestor}
            stablecoin={desk.data?.stablecoin}
            onRefetchBond={bond.refetch}
          />
          <ScheduleControlsCard bondAddress={bondAddress} bond={bond.data} onRefetchBond={bond.refetch} />
          <WalletInvestorCard
            stablecoin={desk.data?.stablecoin}
            walletInvestor={walletInvestor}
            onAdd={addr => setWalletInvestor({ evmAddress: addr })}
          />
        </div>

        <div className="flex flex-col gap-6">
          {bondAddress ? (
            <>
              <BondOverviewCard bondAddress={bondAddress} bond={bond.data} />
              <CouponHistoryCard bondAddress={bondAddress} stablecoinDecimals={desk.data?.stablecoin?.decimals ?? 6} />
            </>
          ) : (
            <div className="card bg-base-100 shadow border border-base-300">
              <div className="card-body gap-2">
                <h3 className="card-title text-base">Nothing issued yet</h3>
                <p className="text-sm text-base-content/70 m-0">
                  Once you issue a bond, its terms, status, schedule and coupon history will appear here, read live from
                  the network.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;

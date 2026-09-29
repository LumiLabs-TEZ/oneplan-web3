/**
 * Port of `HowMoneyIsHeldCopy.swift` (`origin/feat/web3-version`) — verbatim, template content
 * only ("typography/layout will follow Figma in a later pass", per the Swift doc comment). Every
 * string here is an i18n KEY (the raw English source, matching `src/i18n/locales/en.json`'s
 * `Localizable.xcstrings`-derived key convention) — the screen calls `t(key)` per string so the
 * Vietnamese catalog applies; this module never calls `t()` itself.
 */
export interface HowMoneyIsHeldSection {
  id: string;
  titleKey: string | null;
  paragraphKeys: string[];
  bulletKeys: string[];
}

export const HOW_MONEY_IS_HELD_SECTIONS: HowMoneyIsHeldSection[] = [
  {
    id: 'wallet-yours',
    titleKey: 'Your wallet is yours',
    paragraphKeys: [
      'When you sign in, a wallet is created for your account through our wallet provider, Privy. It holds USDC, a dollar-backed stablecoin, on the Solana network.',
      'You do not need to install anything, and there is no seed phrase to write down or lose. Your access comes from the account you already sign in with.',
    ],
    bulletKeys: [],
  },
  {
    id: 'nothing-moves',
    titleKey: 'Nothing moves without your approval',
    paragraphKeys: [
      'Every payment out of your wallet needs you to approve it. That includes putting money into a trip fund.',
    ],
    bulletKeys: [],
  },
  {
    id: 'trip-fund',
    titleKey: 'A trip fund belongs to the group, not to one friend',
    paragraphKeys: [
      'Normally one person in a group pays for the hotel and then spends two weeks asking everyone else for money. A trip fund replaces that.',
    ],
    bulletKeys: [
      'Every member sees the balance and every movement, at any time',
      "Spending above the limit your group sets needs a second member to approve it before any money moves",
      'At the end of the trip, one settlement pays everyone back at once, and every member can check the numbers themselves',
    ],
  },
  {
    id: 'trust-line',
    titleKey: null,
    paragraphKeys: ["Nobody has to trust one friend with everyone's money."],
    bulletKeys: [],
  },
  {
    id: 'fees',
    titleKey: 'We pay the network fees',
    paragraphKeys: [
      'Sending anything on Solana costs a small network fee. We cover those, so you never need to hold SOL or think about it.',
    ],
    bulletKeys: [],
  },
  {
    id: 'can-cannot',
    titleKey: 'What we can and cannot do',
    paragraphKeys: [
      'We can: show your balance, prepare a payment for you to approve, and pay the network fees.',
      'We cannot: spend your money, move it out of your wallet, or approve a group payment on your behalf.',
    ],
    bulletKeys: [],
  },
  {
    id: 'what-can-go-wrong',
    titleKey: 'What can go wrong, and what we do about it',
    paragraphKeys: [
      'We would rather tell you this now than when it happens.',
      'You lose access to your sign-in account. Your wallet is tied to the account you sign in with. Losing that account means losing in-app access to the wallet. We do not currently offer a separate recovery method (no seed phrase in the app). Protect your Apple or Google account. Once we ship key export, you will be able to save your Solana private key and import it into another wallet (for example Phantom). If you have already exported that key, you can still reach your personal USDC even without OnePlan login. Export must happen before you lose access.',
      'You send USDC to a wrong address. Transfers on Solana cannot be reversed. We check the address format before sending and block addresses from other networks, but we cannot undo a transfer to a valid address that turns out to be the wrong person.',
      'A payment looks like it failed but went through. Confirming a payment and making it are two separate steps. If confirmation is slow, you may see a failure for a few minutes before the status corrects itself. Your money is not lost, and we reconcile against the network automatically.',
      'The stablecoin. USDC is issued by Circle and designed to hold a value of one US dollar. It is not issued by OnePlan and it is not a bank deposit. It is not insured by any government deposit scheme.',
      'A trip fund with no second approver. If your trip has fewer than two people who can approve, any member may approve a payment. Two-person approval only starts once your group has two approvers.',
    ],
    bulletKeys: [],
  },
  {
    id: 'faq',
    titleKey: 'Questions we get asked',
    paragraphKeys: [
      'Is this a bank account? No. It is not a bank account, not a savings product, and not insured by a deposit protection scheme. It is a place to hold trip money and move it between people.',
      'Do you earn interest on my balance? No. Your balance does not earn anything, and we do not lend it out or invest it.',
      "Can I take my money out at any time? Yes, to your own wallet address, subject to network confirmation. Money already inside a trip fund follows your group's approval rules.",
      'What happens if OnePlan shuts down? Your personal USDC sits in your Privy wallet on Solana. OnePlan does not hold it as a bank. If the app disappears, that balance stays on-chain; access is through Privy with the same sign-in, or through a private key you exported earlier into another Solana wallet. Money already inside a trip fund also remains on Solana in the group vault. Managing approvals and payouts today depends on OnePlan. Without the app, that path is not simple for most people — personal wallet funds are the part you can take with you most reliably.',
      'Who else can see my transactions? Members of a trip can see that trip\'s fund and its movements. Solana is a public network, so wallet activity is visible on it, though it is not labelled with your name by us.',
    ],
    bulletKeys: [],
  },
];

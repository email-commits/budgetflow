import { Account, Goal } from "./types";

export interface GoalStatus {
  goal: Goal;
  /** dollars accumulated (save) or paid down (payoff) */
  current: number;
  target: number;
  pct: number;
  accountName?: string;
  /** monthly contribution needed to hit targetDate, if one is set */
  neededPerMonth?: number;
  /** months of history-based pace, projected completion date (undefined = no positive pace yet) */
  monthlyPace?: number;
  projectedDate?: string;
  onTrack?: boolean;
  done: boolean;
}

const MS_MONTH = 30.44 * 86400000;

export function goalStatus(goal: Goal, accounts: Account[], now = new Date()): GoalStatus {
  const account = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined;

  let current: number;
  let target: number;
  if (goal.kind === "payoff") {
    const startOwed = Math.abs(goal.startAmount);
    const owedNow = account ? Math.abs(account.balance) : startOwed;
    current = Math.max(0, startOwed - owedNow); // paid down so far
    target = startOwed;
  } else {
    current = account ? account.balance : goal.manualProgress;
    target = goal.targetAmount;
  }

  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const done = current >= target && target > 0;
  const remaining = Math.max(0, target - current);

  let neededPerMonth: number | undefined;
  let onTrack: boolean | undefined;
  if (goal.targetDate && !done) {
    const monthsLeft = Math.max(0.25, (new Date(goal.targetDate).getTime() - now.getTime()) / MS_MONTH);
    neededPerMonth = remaining / monthsLeft;
  }

  // pace from linked-account movement since creation
  let monthlyPace: number | undefined;
  let projectedDate: string | undefined;
  const monthsSinceStart = (now.getTime() - new Date(goal.createdAt).getTime()) / MS_MONTH;
  if (account && monthsSinceStart > 0.25) {
    const gained =
      goal.kind === "payoff"
        ? Math.abs(goal.startAmount) - Math.abs(account.balance)
        : account.balance - goal.startAmount;
    const pace = gained / monthsSinceStart;
    if (pace > 0) {
      monthlyPace = pace;
      const monthsToGo = remaining / pace;
      if (monthsToGo < 600) {
        const d = new Date(now.getTime() + monthsToGo * MS_MONTH);
        projectedDate = d.toISOString().slice(0, 10);
        if (goal.targetDate) onTrack = projectedDate <= goal.targetDate;
      }
    }
  }

  return {
    goal,
    current,
    target,
    pct,
    accountName: account?.name,
    neededPerMonth,
    monthlyPace,
    projectedDate,
    onTrack,
    done,
  };
}

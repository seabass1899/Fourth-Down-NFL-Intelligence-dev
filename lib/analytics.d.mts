export function decimalOdds(american:number):number;
export function impliedProbability(american:number):number;
export function settledReturn(stake:number,american:number,result:string,override?:number):number;
export function settledProfit(stake:number,american:number,result:string,override?:number):number;
export function expectedValue(stake:number,american:number,estimatedWinProbability:number):number;
export function summarize(wagers:Array<{stake:number;odds:number;result:string;returnOverride?:number}>):{settled:number;wins:number;losses:number;staked:number;profit:number;roi:number;winRate:number};

import type {Wager} from './seed';
export declare function wagerFingerprint(w:Partial<Wager>):string;
export declare function isValidLegacyWager(w:unknown):boolean;
export declare function deterministicWagerId(userId:string,w:Wager,digest?:(value:string)=>Promise<Uint8Array>):Promise<string>;
export declare function planLegacyImport(userId:string,legacy:Wager[],existing:Wager[]):Promise<{accepted:Wager[];duplicates:number;invalid:number}>;

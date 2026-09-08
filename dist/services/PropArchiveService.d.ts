import type { PropArchiveRecord, PropType } from '../types/index.js';
/** Exported so bulk repairs key rows the same way updateResult matches them. */
export declare function normalizePropType(propType: unknown): PropType;
export declare class PropArchiveService {
    private static readonly RESULT_MATCH_WINDOW_MS;
    private static chromeGet;
    private static chromeSet;
    private static getAllRecords;
    private static setAllRecords;
    private static _writeChain;
    static runExclusive<T>(fn: () => Promise<T>): Promise<T>;
    /** Atomically read-modify-write the whole archive under the write lock. */
    static mutate(fn: (rows: PropArchiveRecord[]) => PropArchiveRecord[] | Promise<PropArchiveRecord[]>): Promise<void>;
    static addProp(record: PropArchiveRecord): Promise<void>;
    static addProps(records: PropArchiveRecord[]): Promise<void>;
    static updateResult(fighter: string, event: string, propType: PropType, result: number, options?: {
        date?: string;
        opponent?: string | null;
    }): Promise<boolean>;
    static getFighterHistory(fighter: string): Promise<PropArchiveRecord[]>;
    static getPlatformHistory(fighter: string, platform: string, propType?: PropType): Promise<PropArchiveRecord[]>;
    static fighterHasFantasyLineHistory(fighter: string): Promise<boolean>;
    static fighterHasPerformanceHistory(fighter: string): Promise<boolean>;
    static backfillUnresolvedFromKnownOutcomes(options?: {
        eventIncludes?: string;
        maxScore?: number;
        minHoursBetweenRuns?: number;
    }): Promise<{
        changed: number;
        unresolvedBefore: number;
        unresolvedAfter: number;
    }>;
}
//# sourceMappingURL=PropArchiveService.d.ts.map
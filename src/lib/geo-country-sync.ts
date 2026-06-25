import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getMgmtAllowCountries, MGMT_GEO_LIST } from "./config";
import { isRouterPriorityActive } from "./router-busy";
import {
  getAddressList,
  removeAddressListEntry,
  upsertAddressListEntry,
  type MikrotikConfig,
} from "./mikrotik";

export const GEO_COMMENT_PREFIX = "office:geo:";

const GEO_DIR = path.join(process.cwd(), ".data", "geo");
const SYNC_STATE_FILE = path.join(GEO_DIR, "sync-state.json");
const ZONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADD_CONCURRENCY = 20;

type SyncState = Record<
  string,
  {
    syncedAt: number;
    cidrCount: number;
  }
>;

let geoSyncRunning = false;

export function isGeoSyncRunning(): boolean {
  return geoSyncRunning;
}

export type GeoSyncResult = {
  enabled: boolean;
  countries: string[];
  cidrCount: number;
  added: number;
  removed: number;
  skipped: boolean;
  error?: string;
};

function geoComment(countryCode: string): string {
  return `${GEO_COMMENT_PREFIX}${countryCode.toUpperCase()}`;
}

async function readSyncState(): Promise<SyncState> {
  try {
    const raw = await readFile(SYNC_STATE_FILE, "utf-8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return {};
  }
}

async function writeSyncState(state: SyncState): Promise<void> {
  await mkdir(GEO_DIR, { recursive: true });
  await writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function loadCountryZones(countryCode: string): Promise<string[]> {
  const code = countryCode.toLowerCase();
  const cacheFile = path.join(GEO_DIR, `${code}.zone`);
  const metaFile = path.join(GEO_DIR, `${code}.meta`);
  await mkdir(GEO_DIR, { recursive: true });

  try {
    const meta = JSON.parse(await readFile(metaFile, "utf-8")) as { fetchedAt: number };
    if (Date.now() - meta.fetchedAt < ZONE_TTL_MS) {
      const cached = await readFile(cacheFile, "utf-8");
      return parseZone(cached);
    }
  } catch {
    // обновим кэш
  }

  const response = await fetch(
    `https://www.ipdeny.com/ipblocks/data/countries/${code}.zone`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Не удалось загрузить IP-блоки ${countryCode.toUpperCase()}: HTTP ${response.status}`);
  }

  const body = await response.text();
  await writeFile(cacheFile, body, "utf-8");
  await writeFile(
    path.join(GEO_DIR, `${code}.meta`),
    JSON.stringify({ fetchedAt: Date.now() }),
    "utf-8",
  );

  return parseZone(body);
}

function parseZone(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(line));
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Загружает CIDR Вьетнама (и др. стран) в address-list GEO_MGMT на роутере.
 * Первый прогон может занять 1–2 минуты; дальше — раз в сутки.
 */
export async function syncGeoCountryWhitelist(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<GeoSyncResult> {
  const countries = getMgmtAllowCountries();
  if (countries.length === 0) {
    return {
      enabled: false,
      countries: [],
      cidrCount: 0,
      added: 0,
      removed: 0,
      skipped: true,
    };
  }

  const force = process.env.MIKROTIK_MGMT_GEO_FORCE_SYNC === "true";
  const state = await readSyncState();
  const stale = countries.some((code) => {
    const entry = state[code];
    return !entry || Date.now() - entry.syncedAt > SYNC_INTERVAL_MS;
  });

  if (!force && !stale) {
    const cidrCount = countries.reduce((sum, code) => sum + (state[code]?.cidrCount ?? 0), 0);
    return {
      enabled: true,
      countries,
      cidrCount,
      added: 0,
      removed: 0,
      skipped: true,
    };
  }

  if (isRouterPriorityActive()) {
    return {
      enabled: true,
      countries,
      cidrCount: 0,
      added: 0,
      removed: 0,
      skipped: true,
    };
  }

  if (geoSyncRunning) {
    return {
      enabled: true,
      countries,
      cidrCount: 0,
      added: 0,
      removed: 0,
      skipped: true,
    };
  }

  geoSyncRunning = true;
  try {
    let added = 0;
    let removed = 0;
    let totalCidrs = 0;
    const nextState: SyncState = { ...state };

    for (const countryCode of countries) {
      const cidrs = await loadCountryZones(countryCode);
      totalCidrs += cidrs.length;
      const comment = geoComment(countryCode);
      const cidrSet = new Set(cidrs);

      const existing = await getAddressList(config);
      const onRouter = existing.filter(
        (entry) => entry.list === MGMT_GEO_LIST && entry.comment === comment,
      );
      const onRouterSet = new Set(
        onRouter.map((entry) => entry.address).filter(Boolean) as string[],
      );

      const toAdd = cidrs.filter((cidr) => !onRouterSet.has(cidr));
      if (!dryRun && toAdd.length > 0) {
        await mapConcurrent(toAdd, ADD_CONCURRENCY, async (cidr) => {
          const result = await upsertAddressListEntry(
            config,
            MGMT_GEO_LIST,
            cidr,
            comment,
            undefined,
            false,
          );
          if (result.added) added++;
        });
      } else if (dryRun) {
        added += toAdd.length;
      }

      const toRemove = onRouter.filter(
        (entry) => entry.address && !cidrSet.has(entry.address),
      );
      for (const entry of toRemove) {
        if (!entry[".id"]) continue;
        if (!dryRun) {
          await removeAddressListEntry(config, entry[".id"], false);
        }
        removed++;
      }

      nextState[countryCode] = {
        syncedAt: Date.now(),
        cidrCount: cidrs.length,
      };
    }

    if (!dryRun) {
      await writeSyncState(nextState);
    }

    return {
      enabled: true,
      countries,
      cidrCount: totalCidrs,
      added,
      removed,
      skipped: false,
    };
  } catch (error) {
    return {
      enabled: true,
      countries,
      cidrCount: 0,
      added: 0,
      removed: 0,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    geoSyncRunning = false;
  }
}

import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import https from "https";
import type { IncomingHttpHeaders } from "http";
import path from "path";
import { getCredentialsStore } from "./credentials";
import { getMikrotikConfig } from "./config";
import { syncPanelWhitelist } from "./panel-ip";

const STATE_DIR = path.join(process.cwd(), ".data");
const DEFAULT_STATE_FILE = path.join(STATE_DIR, "vmware-stopped.json");
const HYPERVISOR_CREDENTIAL_ID = "srv-hypervisor";

/** ESXi uses self-signed TLS */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });
const REQUEST_TIMEOUT_MS = Number(process.env.VMWARE_TIMEOUT_MS) || 10_000;
export type VmwareConfig = {
  host: string;
  username: string;
  password: string;
  dryRun: boolean;
  powerOffType: "GUEST_OS" | "FORCE";
  stateFile: string;
  protectNames: Set<string>;
};

export type VmInfo = {
  id: string;
  name: string;
  powerState: "on" | "off" | "suspended" | "unknown";
  cpus: number;
  memoryMb: number;
  role?: string;
};

export type VmwareStatus = {
  configured: boolean;
  connected: boolean;
  dryRun: boolean;
  host: string | null;
  vms: VmInfo[];
  runningCount: number;
  stoppedCount: number;
  totalCount: number;
  updatedAt: string;
  error?: string;
  hint?: string;
};

export type VmwareToggleResult = {
  ok: boolean;
  message: string;
  dryRun: boolean;
};

type StoppedState = {
  vmIds: string[];
  stoppedAt: string;
};

type SoapSession = {
  cookie: string;
  sdkUrl: string;
};

const ROLE_HINTS: Record<string, string> = {
  ad: "Active Directory",
  "active directory": "Active Directory",
  dc: "Domain Controller",
  domain: "Domain Controller",
  kms: "KMS",
  zabbix: "Zabbix",
  web: "Web",
  bot: "Bot",
  nps: "NPS",
};

export class VmwareError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "VmwareError";
  }
}

function normalizeHost(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function guessRole(name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, role] of Object.entries(ROLE_HINTS)) {
    if (lower.includes(key)) return role;
  }
  return undefined;
}

function mapPowerState(state: string): VmInfo["powerState"] {
  switch (state) {
    case "POWERED_ON":
    case "poweredOn":
      return "on";
    case "POWERED_OFF":
    case "poweredOff":
      return "off";
    case "SUSPENDED":
    case "suspended":
      return "suspended";
    default:
      return "unknown";
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseSoapFault(body: string): string | null {
  const match = body.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function extractSessionCookie(headers: IncomingHttpHeaders): string | null {
  const setCookie = headers["set-cookie"];
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  for (const cookie of cookies) {
    const match = cookie.match(/vmware_soap_session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

function parseVmListXml(xml: string): VmInfo[] {
  const vms: VmInfo[] = [];
  const blocks =
    xml.match(
      /<returnval><obj type="VirtualMachine">(\d+)<\/obj>[\s\S]*?<\/returnval>/g,
    ) ?? [];

  for (const block of blocks) {
    const idMatch = block.match(/<obj type="VirtualMachine">(\d+)<\/obj>/);
    const nameMatch = block.match(
      /<name>name<\/name><val[^>]*>([^<]+)<\/val>/,
    );
    const powerMatch = block.match(
      /<name>runtime\.powerState<\/name><val[^>]*>([^<]+)<\/val>/,
    );
    const cpuMatch = block.match(
      /<name>config\.hardware\.numCPU<\/name><val[^>]*>(\d+)<\/val>/,
    );
    const memMatch = block.match(
      /<name>config\.hardware\.memoryMB<\/name><val[^>]*>(\d+)<\/val>/,
    );

    if (!idMatch || !nameMatch) continue;

    const name = nameMatch[1];
    vms.push({
      id: idMatch[1],
      name,
      powerState: mapPowerState(powerMatch?.[1] ?? ""),
      cpus: Number(cpuMatch?.[1] ?? 0),
      memoryMb: Number(memMatch?.[1] ?? 0),
      role: guessRole(name),
    });
  }

  return vms.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

async function resolveVmwareCredentials(): Promise<{
  host: string | null;
  username: string | null;
  password: string | null;
}> {
  const envHost = process.env.VMWARE_HOST ?? process.env.VMWARE_ESXI_HOST;
  const envUser = process.env.VMWARE_USERNAME ?? process.env.VMWARE_USER;
  const envPass = process.env.VMWARE_PASSWORD;

  if (envHost?.trim() && envUser?.trim() && envPass) {
    return {
      host: normalizeHost(envHost),
      username: envUser.trim(),
      password: envPass,
    };
  }

  const store = await getCredentialsStore();
  const entry = store?.categories
    .flatMap((c) => c.entries)
    .find((e) => e.id === HYPERVISOR_CREDENTIAL_ID);

  if (!entry?.username || !entry.password) {
    return { host: null, username: null, password: null };
  }

  let host: string | null = null;
  if (entry.url) host = normalizeHost(entry.url);
  else if (entry.host) host = normalizeHost(entry.host);

  return {
    host,
    username: entry.username,
    password: entry.password,
  };
}

export async function getVmwareConfig(): Promise<VmwareConfig | null> {
  const { host, username, password } = await resolveVmwareCredentials();
  if (!host || !username || !password) return null;

  const protectRaw = process.env.VMWARE_PROTECT_VMS ?? "";
  const protectNames = new Set(
    protectRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  const powerOffType =
    process.env.VMWARE_POWER_OFF_TYPE === "GUEST_OS" ? "GUEST_OS" : "FORCE";

  return {
    host,
    username,
    password,
    dryRun: process.env.VMWARE_DRY_RUN !== "false",
    powerOffType,
    stateFile: process.env.VMWARE_STATE_FILE ?? DEFAULT_STATE_FILE,
    protectNames,
  };
}

async function readStoppedState(file: string): Promise<StoppedState | null> {
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoppedState>;
    if (!Array.isArray(parsed.vmIds)) return null;
    return { vmIds: parsed.vmIds, stoppedAt: parsed.stoppedAt ?? "" };
  } catch {
    return null;
  }
}

async function writeStoppedState(file: string, state: StoppedState | null): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  if (!state?.vmIds?.length) {
    try {
      await unlink(file);
    } catch {
      // ignore
    }
    return;
  }
  await writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

async function httpsRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{
  status: number;
  body: string;
  headers: IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
        agent: insecureAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`connect ETIMEDOUT (${REQUEST_TIMEOUT_MS}ms)`));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function needsNatWhitelist(host: string): boolean {
  const natPort = process.env.VMWARE_NAT_PORT ?? "8822";
  return host.includes(`:${natPort}`);
}

let lastVmwareWhitelistAt = 0;
const VMWARE_WHITELIST_DEBOUNCE_MS = 5 * 60 * 1000;

/** Раз в 5 минут добавляет IP панели в 0_WL (без тяжёлых правок firewall на каждый опрос). */
async function ensureVmwareNatAccess(host: string): Promise<string | null> {
  if (process.env.VMWARE_AUTO_WHITELIST === "false") return null;
  if (!needsNatWhitelist(host)) return null;
  if (!getMikrotikConfig()?.allowWrite) return null;

  const now = Date.now();
  if (now - lastVmwareWhitelistAt < VMWARE_WHITELIST_DEBOUNCE_MS) return null;
  lastVmwareWhitelistAt = now;

  const result = await syncPanelWhitelist().catch(() => ({ ip: null as string | null }));
  return result.ip;
}

function connectionHint(host: string | null, message: string): string | undefined {
  if (
    message.includes("Cannot complete login") ||
    message.includes("InvalidLogin") ||
    message.includes("incorrect user name or password")
  ) {
    return "Неверный логин или пароль root на гипервизоре";
  }

  const unreachable =
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Timeout");

  if (!unreachable) return undefined;

  if (host?.includes("192.168.")) {
    return "Local IP is only reachable from office LAN or VPN. Set VMWARE_HOST to your public NAT endpoint.";
  }

  if (host?.includes(":8822")) {
    return "Порт 8822: проверьте NAT на гипервизор и порядок firewall (established → exempt → drop)";
  }

  return "Панель должна иметь сетевой доступ к гипервизору (офис, VPN или NAT)";
}

function wrapSoapBody(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<soapenv:Body>
${inner}
</soapenv:Body>
</soapenv:Envelope>`;
}

async function soapCall(
  session: SoapSession,
  bodyInner: string,
): Promise<string> {
  const response = await httpsRequest(session.sdkUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"urn:vim25/8.0"',
      Cookie: `vmware_soap_session=${session.cookie}`,
    },
    body: wrapSoapBody(bodyInner),
  });

  const fault = parseSoapFault(response.body);
  if (fault) throw new VmwareError(fault, response.status);
  if (response.status < 200 || response.status >= 300) {
    throw new VmwareError(
      response.body.slice(0, 200) || `HTTP ${response.status}`,
      response.status,
    );
  }

  return response.body;
}

async function openSoapSession(config: VmwareConfig): Promise<SoapSession> {
  await ensureVmwareNatAccess(config.host);

  const sdkUrl = `${config.host.replace(/\/$/, "")}/sdk/`;
  const loginBody = wrapSoapBody(`<vim:Login>
  <vim:_this type="SessionManager">ha-sessionmgr</vim:_this>
  <vim:userName>${escapeXml(config.username)}</vim:userName>
  <vim:password>${escapeXml(config.password)}</vim:password>
</vim:Login>`);

  const response = await httpsRequest(sdkUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"urn:vim25/8.0"',
    },
    body: loginBody,
  });

  const fault = parseSoapFault(response.body);
  if (fault) throw new VmwareError(fault, response.status);

  const cookie = extractSessionCookie(response.headers);
  if (!cookie) {
    throw new VmwareError("??? vmware_soap_session ????? ????? ? ESXi");
  }

  return { cookie, sdkUrl };
}

async function closeSoapSession(session: SoapSession): Promise<void> {
  try {
    await soapCall(
      session,
      `<vim:Logout><vim:_this type="SessionManager">ha-sessionmgr</vim:_this></vim:Logout>`,
    );
  } catch {
    // ignore
  }
}

async function createVmContainerView(session: SoapSession): Promise<string> {
  const xml = await soapCall(
    session,
    `<vim:CreateContainerView>
  <vim:_this type="ViewManager">ViewManager</vim:_this>
  <vim:container type="Folder">ha-folder-root</vim:container>
  <vim:type>VirtualMachine</vim:type>
  <vim:recursive>true</vim:recursive>
</vim:CreateContainerView>`,
  );

  const match = xml.match(/type="ContainerView">([^<]+)<\/returnval>/);
  if (!match) throw new VmwareError("?? ??????? ??????? ContainerView ?? ESXi");
  return match[1];
}

async function destroyContainerView(
  session: SoapSession,
  viewRef: string,
): Promise<void> {
  try {
    await soapCall(
      session,
      `<vim:DestroyView>
  <vim:_this type="ViewManager">ViewManager</vim:_this>
  <vim:view type="ContainerView">${escapeXml(viewRef)}</vim:view>
</vim:DestroyView>`,
    );
  } catch {
    // ignore
  }
}

export async function listVms(config: VmwareConfig): Promise<VmInfo[]> {
  const session = await openSoapSession(config);
  let viewRef: string | null = null;
  try {
    viewRef = await createVmContainerView(session);
    const xml = await soapCall(
      session,
      `<vim:RetrieveProperties>
  <vim:_this type="PropertyCollector">ha-property-collector</vim:_this>
  <vim:specSet>
    <vim:propSet>
      <vim:type>VirtualMachine</vim:type>
      <vim:pathSet>name</vim:pathSet>
      <vim:pathSet>runtime.powerState</vim:pathSet>
      <vim:pathSet>config.hardware.numCPU</vim:pathSet>
      <vim:pathSet>config.hardware.memoryMB</vim:pathSet>
    </vim:propSet>
    <vim:objectSet>
      <vim:obj type="ContainerView">${escapeXml(viewRef)}</vim:obj>
      <vim:skip>false</vim:skip>
      <vim:selectSet xsi:type="vim:TraversalSpec">
        <vim:name>view</vim:name>
        <vim:type>ContainerView</vim:type>
        <vim:path>view</vim:path>
        <vim:skip>false</vim:skip>
      </vim:selectSet>
    </vim:objectSet>
  </vim:specSet>
</vim:RetrieveProperties>`,
    );

    return parseVmListXml(xml);
  } finally {
    if (viewRef) await destroyContainerView(session, viewRef);
    await closeSoapSession(session);
  }
}

async function vmPowerAction(
  config: VmwareConfig,
  vmId: string,
  action: "start" | "stop",
): Promise<void> {
  if (config.dryRun) return;

  const session = await openSoapSession(config);
  try {
    if (action === "start") {
      await soapCall(
        session,
        `<vim:PowerOnVM_Task>
  <vim:_this type="VirtualMachine">${escapeXml(vmId)}</vim:_this>
</vim:PowerOnVM_Task>`,
      );
      return;
    }

    if (config.powerOffType === "FORCE") {
      await soapCall(
        session,
        `<vim:PowerOffVM_Task>
  <vim:_this type="VirtualMachine">${escapeXml(vmId)}</vim:_this>
</vim:PowerOffVM_Task>`,
      );
      return;
    }

    await soapCall(
      session,
      `<vim:ShutdownGuest>
  <vim:_this type="VirtualMachine">${escapeXml(vmId)}</vim:_this>
</vim:ShutdownGuest>`,
    );
  } finally {
    await closeSoapSession(session);
  }
}

export async function getVmwareStatus(): Promise<VmwareStatus> {
  const updatedAt = new Date().toISOString();
  const config = await getVmwareConfig();

  if (!config) {
    return {
      configured: false,
      connected: false,
      dryRun: process.env.VMWARE_DRY_RUN !== "false",
      host: null,
      vms: [],
      runningCount: 0,
      stoppedCount: 0,
      totalCount: 0,
      updatedAt,
      error:
        "??????? VMWARE_HOST ? ??????? ?????? ? .env.local ??? ?????? �?????????? VMware� ? credentials.json",
    };
  }

  try {
    const vms = await listVms(config);
    const runningCount = vms.filter((v) => v.powerState === "on").length;
    const stoppedCount = vms.filter(
      (v) => v.powerState === "off" || v.powerState === "suspended",
    ).length;

    return {
      configured: true,
      connected: true,
      dryRun: config.dryRun,
      host: config.host,
      vms,
      runningCount,
      stoppedCount,
      totalCount: vms.length,
      updatedAt,
      hint: config.dryRun
        ? "Dry-run: ??????????? ?????? ?? ???????????"
        : config.powerOffType === "GUEST_OS"
          ? "?????? ??????????: ?????? �????????� ????? ??????????, ???? ?? ????????? ??????"
          : undefined,
    };
  } catch (error) {
    const message =
      error instanceof VmwareError
        ? error.message
        : error instanceof Error
          ? error.message
          : "??????????? ??????";

    const hint = connectionHint(config.host, message);

    return {
      configured: true,
      connected: false,
      dryRun: config.dryRun,
      host: config.host,
      vms: [],
      runningCount: 0,
      stoppedCount: 0,
      totalCount: 0,
      updatedAt,
      error: message,
      hint,
    };
  }
}

export async function toggleVm(
  vmId: string,
  action: "start" | "stop",
): Promise<VmwareToggleResult> {
  const config = await getVmwareConfig();
  if (!config) {
    return { ok: false, message: "VMware ?? ????????", dryRun: true };
  }

  try {
    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] ${action === "stop" ? "??????????" : "?????????"} VM ${vmId}`,
        dryRun: true,
      };
    }

    await vmPowerAction(config, vmId, action);

    return {
      ok: true,
      message: action === "stop" ? "??????? ?????????? ??????????" : "??????? ????????? ??????????",
      dryRun: false,
    };
  } catch (error) {
    const message =
      error instanceof VmwareError
        ? error.message
        : error instanceof Error
          ? error.message
          : "??????????? ??????";
    return { ok: false, message, dryRun: config.dryRun };
  }
}

export async function toggleAllVms(action: "off" | "on"): Promise<VmwareToggleResult> {
  const config = await getVmwareConfig();
  if (!config) {
    return { ok: false, message: "VMware ?? ????????", dryRun: true };
  }

  try {
    const vms = await listVms(config);

    if (action === "off") {
      const running = vms.filter(
        (v) =>
          v.powerState === "on" &&
          !config.protectNames.has(v.name.toLowerCase()),
      );

      if (running.length === 0) {
        return {
          ok: true,
          message: "??? ?????????? VM ??? ??????????",
          dryRun: config.dryRun,
        };
      }

      if (config.dryRun) {
        return {
          ok: true,
          message: `[Dry-run] ???? ?? ????????? ${running.length} VM`,
          dryRun: true,
        };
      }

      const stoppedIds: string[] = [];
      const failed: string[] = [];

      for (const vm of running) {
        try {
          await vmPowerAction(config, vm.id, "stop");
          stoppedIds.push(vm.id);
        } catch {
          failed.push(vm.name);
        }
      }

      if (stoppedIds.length === 0) {
        return { ok: false, message: "?? ??????? ????????? ?? ????? VM", dryRun: false };
      }

      await writeStoppedState(config.stateFile, {
        vmIds: stoppedIds,
        stoppedAt: new Date().toISOString(),
      });

      const failedNote = failed.length > 0 ? ` ?? ?????????: ${failed.join(", ")}.` : "";

      return {
        ok: failed.length === 0,
        message: `????????? VM: ${stoppedIds.length}.${failedNote}`,
        dryRun: false,
      };
    }

    const state = await readStoppedState(config.stateFile);
    const toStart = state?.vmIds?.length
      ? vms.filter((v) => state.vmIds.includes(v.id))
      : vms.filter((v) => v.powerState === "off" || v.powerState === "suspended");

    if (toStart.length === 0) {
      await writeStoppedState(config.stateFile, null);
      return {
        ok: true,
        message: "??? ??????????? VM ??? ???????",
        dryRun: config.dryRun,
      };
    }

    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] ???? ?? ???????? ${toStart.length} VM`,
        dryRun: true,
      };
    }

    let started = 0;
    const failed: string[] = [];

    for (const vm of toStart) {
      try {
        await vmPowerAction(config, vm.id, "start");
        started += 1;
      } catch {
        failed.push(vm.name);
      }
    }

    await writeStoppedState(config.stateFile, null);

    const failedNote = failed.length > 0 ? ` ?? ????????: ${failed.join(", ")}.` : "";

    return {
      ok: failed.length === 0,
      message: `???????? VM: ${started}.${failedNote}`,
      dryRun: false,
    };
  } catch (error) {
    const message =
      error instanceof VmwareError
        ? error.message
        : error instanceof Error
          ? error.message
          : "??????????? ??????";
    return { ok: false, message, dryRun: config.dryRun };
  }
}

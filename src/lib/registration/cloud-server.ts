import { getRegruConfig } from "@/lib/regru";

export type CloudServerConfig = {
  host: string;
  hostname: string;
  adminUser: string;
  adminPassword: string;
  storageRoot: string;
  winrmPort: number;
  serviceId?: string;
  serverId?: string;
};

const DEDICATED_SERVICE_ID = process.env.CLOUD_SERVER_SERVICE_ID ?? "56917767";

async function regruDedicatedDetails(): Promise<Partial<CloudServerConfig> | null> {
  const config = await getRegruConfig();
  if (!config) return null;

  const body = new URLSearchParams({
    username: config.username,
    password: config.password,
    output_content_type: "plain",
    service_id: DEDICATED_SERVICE_ID,
  });

  const response = await fetch("https://api.reg.ru/api/regru2/service/get_details", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    result?: string;
    answer?: { services?: Array<{ details?: Record<string, string> }> };
  };

  if (data.result !== "success") return null;

  const details = data.answer?.services?.[0]?.details;
  if (!details?.ip) return null;

  return {
    host: details.ip,
    adminUser: details.login ?? "Администратор",
    adminPassword: details.passwd,
    serverId: details.server_id,
    serviceId: DEDICATED_SERVICE_ID,
  };
}

export async function getCloudServerConfig(): Promise<CloudServerConfig | null> {
  const fromEnv =
    process.env.CLOUD_SERVER_HOST &&
    process.env.CLOUD_SERVER_ADMIN_USER &&
    process.env.CLOUD_SERVER_ADMIN_PASSWORD;

  if (fromEnv) {
    return {
      host: process.env.CLOUD_SERVER_HOST!,
      hostname: process.env.CLOUD_SERVER_HOSTNAME ?? "cloud.example.com",
      adminUser: process.env.CLOUD_SERVER_ADMIN_USER!,
      adminPassword: process.env.CLOUD_SERVER_ADMIN_PASSWORD!,
      storageRoot: process.env.CLOUD_SERVER_STORAGE_ROOT ?? "C:\\Storage",
      winrmPort: Number(process.env.CLOUD_SERVER_WINRM_PORT) || 5985,
      serviceId: DEDICATED_SERVICE_ID,
    };
  }

  const fromApi = await regruDedicatedDetails();
  if (!fromApi?.host || !fromApi.adminPassword) return null;

  return {
    host: fromApi.host,
    hostname: process.env.CLOUD_SERVER_HOSTNAME ?? "cloud.example.com",
    adminUser: fromApi.adminUser ?? "Администратор",
    adminPassword: fromApi.adminPassword,
    storageRoot: "C:\\Storage",
    winrmPort: 5985,
    serviceId: fromApi.serviceId,
    serverId: fromApi.serverId,
  };
}

export function buildCloudFolderPath(login: string, hostname = "cloud.example.com"): string {
  const safe = login.trim().toLowerCase();
  return `\\\\${hostname}\\Storage\\${safe}`;
}

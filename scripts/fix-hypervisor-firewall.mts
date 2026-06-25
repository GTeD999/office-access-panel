import { getMikrotikConfig } from "../src/lib/config";
import {
  ensureForwardBlockOrder,
  getFirewallRules,
  maintainProtectedAccessWhileBlocked,
} from "../src/lib/mikrotik";

async function main() {
  const config = getMikrotikConfig();
  if (!config?.allowWrite) {
    console.error("MikroTik write disabled");
    process.exit(1);
  }

  const maintain = await maintainProtectedAccessWhileBlocked(config, false);
  const order = await ensureForwardBlockOrder(config, false);
  console.log("maintain:", maintain);
  console.log("order:", order);

  const rules = await getFirewallRules(config);
  const fwd = rules.filter((r) => r.chain === "forward" && r.disabled !== "true");
  console.log("Forward chain:");
  fwd.slice(0, 12).forEach((r, i) => {
    console.log(`  ${i} ${r.action} ${r.comment ?? r["src-address"] ?? ""}`);
  });
}

void main();

# Office Access Panel

A unified **Next.js** control panel for office infrastructure — network, identity, hosting, hypervisor, and third-party services in one place. Built for sysadmins and IT leads who need safe, auditable operations without jumping between ten different admin UIs.

## Highlights

- **Single dashboard** for day-to-day office IT tasks
- **Dry-run mode** on destructive integrations — test changes before they hit production
- **Session auth** with optional device remember and IP whitelist
- **Modular panels** — enable only the integrations you configure in `.env.local`

## What it does

| Module | Description |
|--------|-------------|
| **Network control** | Toggle office internet, manage MikroTik firewall rules, DDNS whitelist sync, geo-based rules |
| **User provisioning** | Onboard employees: mail, Active Directory, CRM, cloud folder — from one registration flow |
| **Employee directory** | View and manage accounts across connected systems |
| **Credential vault** | Encrypted storage for service passwords (local JSON vault + UI) |
| **Accounts panel** | Toggle third-party portals (maps, classifieds, mail providers) in dry-run or live mode |
| **VMware** | ESXi VM power state and basic management |
| **Reg.ru** | Domain and hosting control via Reg.ru API |
| **Remote desktop** | Quick links to office machines / hypervisor consoles |
| **Bitrix24** | Site access toggle and CRM webhook integration |

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS |
| Network | MikroTik REST API |
| Identity | Active Directory (LDAP), Yandex 360 API |
| Infra APIs | VMware REST, Reg.ru, Bitrix24 webhooks |
| Runtime | Node.js 20+ |

## Project structure

```
src/
  app/              Next.js App Router — pages & API routes
  components/       Dashboard panels (network, vault, employees, …)
  lib/              Integrations: mikrotik, ad, bitrix, regru, vmware
  lib/registration/ Multi-step employee provisioning pipeline
scripts/            One-off AD / MikroTik maintenance utilities
deploy/             Example PHP snippet for Bitrix site toggle
```

## Getting started

### Prerequisites

- Node.js 20+
- npm or pnpm
- (Optional) reachable MikroTik, AD, VMware, Reg.ru — all support **dry-run** without real endpoints

### Install & run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with the access phrase from `ACCESS_SECRET` in `.env.local`.

### Production build

```bash
npm run build
npm start
```

## Configuration

Copy `.env.example` to `.env.local` and fill in only the modules you need.

| Variable group | Purpose |
|----------------|---------|
| `MIKROTIK_*` | Router REST API host, credentials, `MIKROTIK_DRY_RUN` |
| `ACCESS_SECRET` | Panel login passphrase |
| `BITRIX24_WEBHOOK_URL` | CRM incoming webhook |
| `VMWARE_*` | ESXi host and credentials |
| `REGRU_*` / `REGVPS_*` | Domain & VPS provider API |
| `ACCOUNTS_DRY_RUN` | Safe mode for external account toggles |
| `AD_*`, `CLOUD_SERVER_*` | Employee provisioning targets |

Example files (no secrets committed):

- `accounts.example.json` — third-party portal definitions
- `vault.example.json` — vault structure sample

## API routes (internal)

The app exposes server-side routes under `/api/*` for auth, status, internet switch, registration, vault, VMware, Reg.ru, and Bitrix. All require an authenticated session unless noted in code.

## Security notes

- **Source code only** — no production IPs, passwords, or client data in the repository
- `.env.local`, `.data/`, and credential files are **gitignored**
- Default flags (`*_DRY_RUN=true`, `MIKROTIK_ALLOW_WRITE=false`) prevent accidental live changes during local development
- Rotate any secrets that were ever stored outside env vars

## License

Portfolio / demonstration project.

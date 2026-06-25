# Office Access Panel

Internal dashboard for office infrastructure — network control, user provisioning, and third-party service integrations.

## Features

- Network router management (internet on/off, firewall)
- User provisioning (Active Directory, CRM, cloud services)
- Hypervisor VM management
- Domain and hosting control
- Encrypted credential vault
- Session-based authentication with IP whitelist

## Tech stack

Next.js 15 · TypeScript · React · MikroTik REST API · Docker

## Getting started

```bash
cp .env.example .env.local
npm install && npm run dev
```

## Security

Source code only — configure all credentials via `.env.local`. No client data included.

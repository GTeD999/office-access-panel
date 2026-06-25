# Novactiv Access

Office infrastructure management dashboard — control network access, user provisioning, and service integrations from a single Next.js panel.

## Features

- **Network control** — MikroTik router management (internet on/off, firewall rules)
- **User provisioning** — Active Directory, Bitrix24, Yandex 360 account creation
- **VMware integration** — hypervisor VM power management
- **Domain management** — Reg.ru hosting and DNS control
- **Credential vault** — encrypted local credential storage
- **Security** — session-based auth, IP whitelist, management lock rules

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15, TypeScript, React |
| Router API | MikroTik REST API (RouterOS 7+) |
| Integrations | Active Directory, Bitrix24, Yandex 360, VMware, Reg.ru |
| Auth | HttpOnly session cookies |

## Getting started

```bash
cp .env.example .env.local
# Configure all integration credentials in .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

See `.env.example`. All sensitive values (router passwords, AD bind credentials, API tokens) must be set via environment variables — never committed to git.

## Security

This repository contains **source code only**. No credentials, IP addresses, API keys, or client data are included.

## License

Private / portfolio project.

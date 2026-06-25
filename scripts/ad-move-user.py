#!/usr/bin/env python3
"""Перенос пользователя AD в целевой OU (ldapjs не справляется с кириллицей в OU)."""
from __future__ import annotations

import json
import os
import sys

try:
    from ldap3 import SUBTREE, Connection, Server
except ImportError:
    print(json.dumps({"ok": False, "error": "Установите ldap3: pip3 install ldap3"}))
    sys.exit(1)


def load_env_local() -> None:
    env_path = os.path.join(os.getcwd(), ".env.local")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value)


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"ok": False, "error": "Некорректный JSON"}))
        sys.exit(1)

    load_env_local()

    host = payload.get("host") or os.environ.get("AD_HOST")
    bind_user = payload.get("bindUser") or os.environ.get("AD_BIND_USER", "")
    bind_password = payload.get("bindPassword") or os.environ.get("AD_BIND_PASSWORD", "")
    sam_account = (payload.get("samAccountName") or "").strip()
    target_ou = (payload.get("targetOuDn") or "").strip()
    cn = (payload.get("cn") or "").strip()
    dry_run = bool(payload.get("dryRun"))

    if not bind_user or not bind_password:
        print(json.dumps({"ok": False, "error": "Нужны AD_BIND_USER и AD_BIND_PASSWORD"}))
        sys.exit(1)
    if not sam_account or not target_ou or not cn:
        print(json.dumps({"ok": False, "error": "Нужны samAccountName, targetOuDn и cn"}))
        sys.exit(1)

    if dry_run:
        print(
            json.dumps(
                {
                    "ok": True,
                    "dryRun": True,
                    "message": f"[Dry-run] {sam_account} → {target_ou}",
                    "dn": f"CN={cn},{target_ou}",
                }
            )
        )
        return

    use_ssl = host.startswith("ldaps")
    server_addr = host.split("://", 1)[1]
    server = Server(server_addr, use_ssl=use_ssl)
    conn = Connection(server, user=bind_user, password=bind_password, auto_bind=True)

    base_dn = os.environ.get("AD_BASE_DN", "DC=office,DC=com")
    conn.search(base_dn, f"(sAMAccountName={sam_account})", SUBTREE, attributes=["distinguishedName"])
    if not conn.entries:
        print(json.dumps({"ok": False, "error": f"Пользователь {sam_account} не найден"}))
        sys.exit(1)

    user_dn = conn.entries[0].entry_dn
    if user_dn.lower().endswith(target_ou.lower()) or f",{target_ou.lower()}" in user_dn.lower():
        print(
            json.dumps(
                {
                    "ok": True,
                    "message": "Уже в целевом OU",
                    "dn": user_dn,
                    "skipped": True,
                }
            )
        )
        conn.unbind()
        return

    ok = conn.modify_dn(user_dn, f"CN={cn}", new_superior=target_ou)
    result = conn.result
    conn.unbind()

    if not ok:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": result.get("description") or result.get("message") or "modify_dn failed",
                    "details": result,
                }
            )
        )
        sys.exit(1)

    new_dn = f"CN={cn},{target_ou}"
    print(json.dumps({"ok": True, "message": f"Перенесён в {target_ou}", "dn": new_dn}))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Включение учётки AD и установка пароля (если доступен LDAPS)."""
from __future__ import annotations

import json
import os
import ssl
import sys

try:
    from ldap3 import MODIFY_REPLACE, SUBTREE, Connection, Server, Tls
except ImportError:
    print(json.dumps({"ok": False, "error": "Установите ldap3: pip3 install ldap3"}))
    sys.exit(1)

# Включена + пароль не обязателен (пока LDAPS недоступен для смены пароля)
UAC_ENABLED_PASSWD_NOTREQD = 544
# Как у остальных сотрудников: включена + пароль не истекает
UAC_ENABLED_NORMAL = 66048


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


def try_set_password(conn: Connection, user_dn: str, password: str) -> bool:
    encoded = f'"{password}"'.encode("utf-16-le")
    return bool(conn.modify(user_dn, {"unicodePwd": [(MODIFY_REPLACE, [encoded])]}))


def try_set_password_ldaps(
    ldaps_host: str, bind_user: str, bind_password: str, user_dn: str, password: str
) -> bool:
    ldaps_addr = ldaps_host.split("://", 1)[1]
    tls = Tls(validate=ssl.CERT_NONE)
    ldaps = Connection(
        Server(ldaps_addr, use_ssl=True, tls=tls),
        user=bind_user,
        password=bind_password,
        auto_bind=True,
    )
    try:
        return try_set_password(ldaps, user_dn, password)
    finally:
        ldaps.unbind()


def try_set_password_samr(
    host: str,
    smb_port: int,
    bind_user: str,
    bind_password: str,
    sam: str,
    password: str,
    domain: str = "NOVACTIV",
) -> bool:
    from impacket.dcerpc.v5 import samr, transport

    admin_user = bind_user.split("@")[0]
    blank_nt = "31d6cfe0d16ae931b73c59d7e0c089c0"
    stringbinding = rf"ncacn_np:{host}[\pipe\samr]"
    rpctransport = transport.DCERPCTransportFactory(stringbinding)
    rpctransport.set_credentials(admin_user, bind_password, domain)
    rpctransport.set_dport(smb_port)
    dce = rpctransport.get_dce_rpc()
    dce.connect()
    dce.bind(samr.MSRPC_UUID_SAMR)
    resp = samr.hSamrConnect(dce)
    server_handle = resp["ServerHandle"]
    resp = samr.hSamrLookupDomainInSamServer(dce, server_handle, domain)
    domain_sid = resp["DomainId"]
    resp = samr.hSamrOpenDomain(dce, server_handle, domainId=domain_sid)
    domain_handle = resp["DomainHandle"]
    resp = samr.hSamrLookupNamesInDomain(dce, domain_handle, [sam])
    user_rid = resp["RelativeIds"]["Element"][0]
    resp = samr.hSamrOpenUser(dce, domain_handle, samr.MAXIMUM_ALLOWED, user_rid)
    user_handle = resp["UserHandle"]
    samr.hSamrChangePasswordUser(
        dce,
        user_handle,
        oldPassword="",
        newPassword=password,
        oldPwdHashNT=blank_nt,
    )
    dce.disconnect()
    return True


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"ok": False, "error": "Некорректный JSON"}))
        sys.exit(1)

    load_env_local()

    sam = (payload.get("samAccountName") or "").strip()
    password = (payload.get("password") or "").strip()
    dry_run = bool(payload.get("dryRun"))

    ldap_host = payload.get("host") or os.environ.get("AD_HOST")
    ldaps_host = payload.get("ldapsHost") or os.environ.get("AD_LDAPS_HOST")
    smb_host = payload.get("smbHost") or os.environ.get("AD_SMB_HOST")
    smb_port = int(payload.get("smbPort") or os.environ.get("AD_SMB_PORT", "9450"))
    ad_domain = payload.get("domain") or os.environ.get("AD_NETBIOS_DOMAIN", "NOVACTIV")
    bind_user = payload.get("bindUser") or os.environ.get("AD_BIND_USER", "")
    bind_password = payload.get("bindPassword") or os.environ.get("AD_BIND_PASSWORD", "")
    base_dn = os.environ.get("AD_BASE_DN", "DC=office,DC=com")

    if not sam or not bind_user or not bind_password:
        print(json.dumps({"ok": False, "error": "Нужны samAccountName и учётные данные AD"}))
        sys.exit(1)

    if dry_run:
        print(json.dumps({"ok": True, "dryRun": True, "message": f"[Dry-run] Активация {sam}"}))
        return

    server_addr = ldap_host.split("://", 1)[1]
    conn = Connection(
        Server(server_addr),
        user=bind_user,
        password=bind_password,
        auto_bind=True,
    )
    conn.search(base_dn, f"(sAMAccountName={sam})", SUBTREE, attributes=["userAccountControl"])
    if not conn.entries:
        print(json.dumps({"ok": False, "error": f"Пользователь {sam} не найден"}))
        sys.exit(1)

    user_dn = conn.entries[0].entry_dn
    uac_before = int(conn.entries[0].userAccountControl.value)
    password_set = False
    password_note = ""

    if password:
        try:
            password_set = try_set_password_ldaps(ldaps_host, bind_user, bind_password, user_dn, password)
            if password_set:
                password_note = " Пароль установлен (LDAPS)."
        except Exception:
            pass
        if not password_set:
            try:
                password_set = try_set_password_samr(
                    smb_host, smb_port, bind_user, bind_password, sam, password, ad_domain
                )
                if password_set:
                    password_note = " Пароль установлен (SMB)."
            except Exception as exc:
                password_note = f" Пароль не установлен: {exc}"

    target_uac = UAC_ENABLED_NORMAL if password_set else UAC_ENABLED_PASSWD_NOTREQD
    uac_after = uac_before
    if (uac_before & 2) or (password_set and uac_before != UAC_ENABLED_NORMAL):
        ok = conn.modify(user_dn, {"userAccountControl": [(MODIFY_REPLACE, [target_uac])]})
        if not ok:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": conn.result.get("description") or "Не удалось включить учётку",
                        "details": conn.result,
                    }
                )
            )
            sys.exit(1)

    conn.search(user_dn, "(objectClass=*)", attributes=["userAccountControl"])
    uac_after = int(conn.entries[0].userAccountControl.value)
    conn.unbind()

    enabled = not (uac_after & 2)
    print(
        json.dumps(
            {
                "ok": True,
                "enabled": enabled,
                "userAccountControl": uac_after,
                "passwordSet": password_set,
                "message": (
                    f"Учётка {'включена' if enabled else 'не включена'}."
                    f"{password_note}"
                ),
            }
        )
    )


if __name__ == "__main__":
    main()

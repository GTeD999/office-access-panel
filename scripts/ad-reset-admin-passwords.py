#!/usr/bin/env python3
"""Смена паролей у всех административных учёток AD (Domain Admins и др.)."""
from __future__ import annotations

import json
import os
import secrets
import ssl
import string
import sys
from datetime import datetime, timezone

try:
    from ldap3 import MODIFY_REPLACE, SUBTREE, Connection, Server, Tls
except ImportError:
    print(json.dumps({"ok": False, "error": "Установите ldap3: pip3 install ldap3"}))
    sys.exit(1)

ADMIN_GROUPS = (
    "Domain Admins",
    "Enterprise Admins",
    "Schema Admins",
    "Administrators",
)

PASSWORD_ALPHABET = string.ascii_letters + string.digits + "!@#$%&*"


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


def gen_password(length: int = 20) -> str:
    while True:
        pwd = "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%&*" for c in pwd)
        ):
            return pwd


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


def set_user_password(
    *,
    ldap_host: str,
    ldaps_host: str,
    smb_host: str,
    smb_port: int,
    ad_domain: str,
    bind_user: str,
    bind_password: str,
    sam: str,
    user_dn: str,
    password: str,
) -> tuple[bool, str]:
    try:
        if try_set_password_ldaps(ldaps_host, bind_user, bind_password, user_dn, password):
            return True, "LDAPS"
    except Exception:
        pass
    try:
        if try_set_password_samr(smb_host, smb_port, bind_user, bind_password, sam, password, ad_domain):
            return True, "SMB"
    except Exception as exc:
        return False, str(exc)
    return False, "Не удалось сменить пароль"


def collect_admin_users(conn: Connection, base_dn: str) -> dict[str, dict]:
    users: dict[str, dict] = {}

    def add_user(entry, source: str) -> None:
        sam = str(entry.sAMAccountName)
        uac = int(entry.userAccountControl.value)
        info = users.get(
            sam,
            {
                "sam": sam,
                "dn": str(entry.entry_dn),
                "displayName": str(entry.displayName) if entry.displayName else "",
                "sources": [],
                "disabled": bool(uac & 2),
            },
        )
        if source not in info["sources"]:
            info["sources"].append(source)
        users[sam] = info

    for gname in ADMIN_GROUPS:
        conn.search(
            base_dn,
            f"(&(objectClass=group)(cn={gname}))",
            SUBTREE,
            attributes=["member"],
        )
        if not conn.entries:
            continue
        members = conn.entries[0].member.values if conn.entries[0].member else []
        for mdn in members:
            conn.search(
                mdn,
                "(objectClass=user)",
                attributes=["sAMAccountName", "userAccountControl", "displayName"],
            )
            if conn.entries:
                add_user(conn.entries[0], gname)

    conn.search(base_dn, "(ou=Admin)", SUBTREE, attributes=["distinguishedName"])
    for ou in conn.entries:
        oudn = str(ou.distinguishedName)
        conn.search(
            oudn,
            "(objectClass=user)",
            SUBTREE,
            attributes=["sAMAccountName", "userAccountControl", "displayName"],
        )
        for entry in conn.entries:
            add_user(entry, "OU=Admin")

    # built-in Administrator
    conn.search(
        base_dn,
        "(sAMAccountName=Administrator)",
        SUBTREE,
        attributes=["sAMAccountName", "userAccountControl", "displayName"],
    )
    for entry in conn.entries:
        add_user(entry, "Built-in")

    return users


def main() -> None:
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}

    load_env_local()

    dry_run = bool(payload.get("dryRun"))
    only_list = bool(payload.get("listOnly"))
    skip_sams = {s.lower() for s in payload.get("skip", [])}

    ldap_host = payload.get("host") or os.environ.get("AD_HOST")
    ldaps_host = payload.get("ldapsHost") or os.environ.get("AD_LDAPS_HOST")
    smb_host = payload.get("smbHost") or os.environ.get("AD_SMB_HOST")
    smb_port = int(payload.get("smbPort") or os.environ.get("AD_SMB_PORT", "9450"))
    ad_domain = payload.get("domain") or os.environ.get("AD_NETBIOS_DOMAIN", "NOVACTIV")
    bind_user = payload.get("bindUser") or os.environ.get("AD_BIND_USER", "")
    bind_password = payload.get("bindPassword") or os.environ.get("AD_BIND_PASSWORD", "")
    base_dn = os.environ.get("AD_BASE_DN", "DC=novactiv,DC=com")
    bind_sam = bind_user.split("@")[0].split("\\")[-1].lower()

    if not bind_user or not bind_password:
        print(json.dumps({"ok": False, "error": "Нужны AD_BIND_USER и AD_BIND_PASSWORD"}))
        sys.exit(1)

    server_addr = ldap_host.split("://", 1)[1]
    conn = Connection(
        Server(server_addr),
        user=bind_user,
        password=bind_password,
        auto_bind=True,
    )

    users = collect_admin_users(conn, base_dn)
    conn.unbind()

    ordered = sorted(users.values(), key=lambda u: u["sam"].lower())
    if only_list:
        print(json.dumps({"ok": True, "users": ordered}, ensure_ascii=False, indent=2))
        return

    results: list[dict] = []
    current_bind_password = bind_password

    # Сначала все, кроме учётки bind — её меняем последней
    for user in ordered:
        if user["sam"].lower() in skip_sams:
            results.append({**user, "skipped": True})
            continue
        if user["sam"].lower() == bind_sam:
            continue
        if user["disabled"]:
            results.append({**user, "skipped": True, "reason": "disabled"})
            continue

        password = gen_password()
        if dry_run:
            results.append({**user, "dryRun": True, "newPassword": password})
            continue

        ok, method = set_user_password(
            ldap_host=ldap_host,
            ldaps_host=ldaps_host,
            smb_host=smb_host,
            smb_port=smb_port,
            ad_domain=ad_domain,
            bind_user=bind_user,
            bind_password=current_bind_password,
            sam=user["sam"],
            user_dn=user["dn"],
            password=password,
        )
        results.append({**user, "ok": ok, "method": method, "newPassword": password if ok else None})

    bind_user_info = next((u for u in ordered if u["sam"].lower() == bind_sam), None)
    if bind_user_info and bind_sam not in skip_sams and not bind_user_info["disabled"]:
        password = gen_password()
        if dry_run:
            results.append({**bind_user_info, "dryRun": True, "newPassword": password, "bindAccount": True})
        else:
            ok, method = set_user_password(
                ldap_host=ldap_host,
                ldaps_host=ldaps_host,
                smb_host=smb_host,
                smb_port=smb_port,
                ad_domain=ad_domain,
                bind_user=bind_user,
                bind_password=current_bind_password,
                sam=bind_user_info["sam"],
                user_dn=bind_user_info["dn"],
                password=password,
            )
            results.append(
                {
                    **bind_user_info,
                    "ok": ok,
                    "method": method,
                    "newPassword": password if ok else None,
                    "bindAccount": True,
                }
            )
            if ok:
                current_bind_password = password

    out = {
        "ok": all(r.get("ok", r.get("skipped")) for r in results if not r.get("dryRun")),
        "dryRun": dry_run,
        "resetAt": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }

    if not dry_run:
        os.makedirs(".data", exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = os.path.join(".data", f"ad-admin-passwords-{stamp}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        out["savedTo"] = path

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

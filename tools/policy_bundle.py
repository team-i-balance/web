"""변환 정책 번들 서명·검증 참고 구현 (BUNDLE-SPEC.md 1.0).

봉투는 DSSE, 서명은 Ed25519. 의존성은 cryptography 하나.

    python policy_bundle.py keygen  keys/console-2026-11          # .key(비밀) .pub(공개) 생성
    python policy_bundle.py sign    policy.json keys/console-2026-11.key console-2026-11 > policy-v13.dsse.json
    python policy_bundle.py verify  policy-v13.dsse.json --trust trust/ --state state.json [--model-sha256 …]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

PAYLOAD_TYPE = "application/vnd.piiguard.policy+json"
SCHEMA = 1


class Reject(Exception):
    """번들을 적용하지 않는 이유. PC는 쓰던 정책을 유지하고 이 이유를 콘솔에 보고한다."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


def pae(payload_type: str, payload: bytes) -> bytes:
    """DSSE Pre-Authentication Encoding. 서명 대상은 JSON 이 아니라 이 바이트다."""
    t = payload_type.encode()
    return b"DSSEv1 %d %s %d %s" % (len(t), t, len(payload), payload)


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def unb64(s: str) -> bytes:
    return base64.b64decode(s, validate=True)


def keygen(prefix: str) -> None:
    k = Ed25519PrivateKey.generate()
    Path(prefix + ".key").write_bytes(k.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    Path(prefix + ".pub").write_bytes(k.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))


def sign(policy: dict, key: Ed25519PrivateKey, keyid: str) -> dict:
    payload = json.dumps(policy, ensure_ascii=False, separators=(",", ":")).encode()
    sig = key.sign(pae(PAYLOAD_TYPE, payload))
    return {"payloadType": PAYLOAD_TYPE, "payload": b64(payload), "signatures": [{"keyid": keyid, "sig": b64(sig)}]}


def bundle_hash(envelope: dict) -> str:
    return "sha256:" + hashlib.sha256(unb64(envelope["payload"])).hexdigest()


def verify(envelope: dict, trusted: dict[str, Ed25519PublicKey], state: dict,
           model_sha256: str | None = None, now: str | None = None) -> dict:
    """검증 순서는 BUNDLE-SPEC.md 4절과 같다. 통과하면 정책(dict)을, 아니면 Reject 를 던진다."""
    if envelope.get("payloadType") != PAYLOAD_TYPE:
        raise Reject("bad_type")
    try:
        payload = unb64(envelope["payload"])
    except Exception:
        raise Reject("bad_envelope")
    ok = False
    for s in envelope.get("signatures", []):
        pub = trusted.get(s.get("keyid"))
        if not pub:
            continue
        try:
            pub.verify(unb64(s["sig"]), pae(PAYLOAD_TYPE, payload))
            ok = True
            break
        except (InvalidSignature, ValueError):
            continue
    if not ok:
        raise Reject("bad_signature")
    policy = json.loads(payload)
    if policy.get("schema") != SCHEMA:
        raise Reject("unsupported_schema", str(policy.get("schema")))
    if policy.get("org") != state.get("org", policy.get("org")):
        raise Reject("wrong_org")
    if policy["version"] <= state.get("version", 0):
        raise Reject("rollback", f"{policy['version']} <= {state.get('version')}")
    if now and policy.get("expires_at") and now > policy["expires_at"]:
        raise Reject("expired")
    want = policy.get("model", {}).get("sha256")
    if want and model_sha256 and want != model_sha256:
        raise Reject("model_mismatch")
    return policy


def load_trust(d: str) -> dict[str, Ed25519PublicKey]:
    return {p.stem: serialization.load_pem_public_key(p.read_bytes()) for p in Path(d).glob("*.pub")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("keygen"); g.add_argument("prefix")
    s = sub.add_parser("sign"); s.add_argument("policy"); s.add_argument("key"); s.add_argument("keyid")
    v = sub.add_parser("verify"); v.add_argument("bundle"); v.add_argument("--trust", required=True)
    v.add_argument("--state", required=True); v.add_argument("--model-sha256"); v.add_argument("--now")
    a = ap.parse_args(argv)
    if a.cmd == "keygen":
        keygen(a.prefix)
    elif a.cmd == "sign":
        key = serialization.load_pem_private_key(Path(a.key).read_bytes(), None)
        json.dump(sign(json.loads(Path(a.policy).read_text()), key, a.keyid), sys.stdout, ensure_ascii=False, indent=1)
    else:
        env = json.loads(Path(a.bundle).read_text())
        st = Path(a.state)
        state = json.loads(st.read_text()) if st.exists() else {}
        try:
            p = verify(env, load_trust(a.trust), state, a.model_sha256, a.now)
        except Reject as e:
            print(json.dumps({"status": "rejected", "reason": e.code, "kept_version": state.get("version")}, ensure_ascii=False))
            return 1
        st.write_text(json.dumps({"org": p["org"], "version": p["version"], "bundle": bundle_hash(env)}))
        print(json.dumps({"status": "applied", "version": p["version"], "rules": len(p.get("rules", []))}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

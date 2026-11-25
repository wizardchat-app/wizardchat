import base64
import json
import os
import re
import sys

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

PACKAGE = "org.wizardchat.android"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}"
UPLOAD_API = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}"
RELEASE_NOTES = [{"language": "en-US", "text": "Bug fixes and stability improvements"}]


def main():
    version = os.environ["RELEASE_VERSION"]
    track = os.environ["PLAY_TRACK"]
    status = os.environ.get("PLAY_RELEASE_STATUS", "completed")
    info = json.loads(base64.b64decode(os.environ["PLAY_SERVICE_ACCOUNT_JSON_BASE64"]))
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    session = AuthorizedSession(credentials)

    def call(method, url, **kwargs):
        response = session.request(method, url, timeout=900, **kwargs)
        if not response.ok:
            sys.exit(f"ERROR: {method} {url} -> {response.status_code}\n{response.text}")
        return response.json()

    edit = call("POST", f"{API}/edits", json={})["id"]
    major, minor, patch, next_ = re.match(r"(\d+)\.(\d+)\.(\d+)(?:-next\.(\d+))?", version).groups()
    expected_code = int(major) * 1_000_000 + int(minor) * 10_000 + int(patch) * 100 + int(next_ or 99)
    uploaded = {int(b["versionCode"]) for b in call("GET", f"{API}/edits/{edit}/bundles").get("bundles", [])}
    if expected_code in uploaded:
        session.delete(f"{API}/edits/{edit}", timeout=60)
        print(f"Version code {expected_code} ({version}) is already on Google Play, nothing to upload")
        return
    with open(sys.argv[1], "rb") as bundle:
        version_code = call(
            "POST",
            f"{UPLOAD_API}/edits/{edit}/bundles?uploadType=media",
            data=bundle,
            headers={"Content-Type": "application/octet-stream"},
        )["versionCode"]
    print(f"Uploaded {version} as version code {version_code}")
    release = {"name": version, "versionCodes": [str(version_code)], "status": status, "releaseNotes": RELEASE_NOTES}
    call("PUT", f"{API}/edits/{edit}/tracks/{track}", json={"track": track, "releases": [release]})
    call("POST", f"{API}/edits/{edit}:commit")
    print(f"Released {version} on the {track} track ({status})")


main()

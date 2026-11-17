#!/usr/bin/env python3
"""Repoint the fixed dev alias only after verifying Firebase trust and Git SHA.

Requires VERCEL_TOKEN in secure environment settings. Never prints credentials.
Uses the official Vercel REST alias endpoint; --apply explicitly enables mutation.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def request(url, token=None, body=None):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError('Remote API returned HTTP ' + str(error.code)) from None
    except urllib.error.URLError:
        raise RuntimeError('Remote API could not be reached; check the environment network policy.') from None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deployment-id', required=True)
    parser.add_argument('--expected-sha', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if len(args.expected_sha) != 40 or any(c not in '0123456789abcdef' for c in args.expected_sha):
        raise RuntimeError('Supply the full expected dev commit SHA.')
    token = os.environ.get('VERCEL_TOKEN')
    if not token:
        raise RuntimeError('VERCEL_TOKEN is missing. Add it securely in environment settings, not in chat.')
    domains = json.loads((ROOT / 'deployment-domains.json').read_text())
    firebase = json.loads((ROOT / 'firebase-applet-config.json').read_text())
    origin = urllib.parse.urlsplit(domains['developmentOrigin'])
    if origin.scheme != 'https' or origin.username or origin.password or origin.path not in ['', '/'] or origin.query or origin.fragment:
        raise RuntimeError('Invalid fixed development origin.')
    key = os.environ.get('VITE_FIREBASE_API_KEY') or firebase['apiKey']
    project = os.environ.get('VITE_FIREBASE_PROJECT_ID') or firebase['projectId']
    config = request('https://identitytoolkit.googleapis.com/v1/projects?' + urllib.parse.urlencode({'key': key}))
    if origin.hostname not in config.get('authorizedDomains', []):
        raise RuntimeError('The fixed development hostname is not authorized in Firebase project ' + project + '. No alias was changed.')
    query = urllib.parse.urlencode({'slug': domains['vercelTeamSlug']})
    api = 'https://api.vercel.com'
    deployment = request(api + '/v13/deployments/' + urllib.parse.quote(args.deployment_id, safe='') + '?' + query, token)
    if deployment.get('readyState') != 'READY' or deployment.get('target') == 'production':
        raise RuntimeError('The selected deployment must be a ready Preview deployment.')
    if deployment.get('name') != domains['vercelProjectName']:
        raise RuntimeError('The deployment belongs to a different Vercel project.')
    metadata = deployment.get('meta', {})
    sha = metadata.get('githubCommitSha') or metadata.get('gitCommitSha') or (deployment.get('gitSource') or {}).get('sha')
    if sha != args.expected_sha:
        raise RuntimeError('The deployment does not match the expected dev commit.')
    alias_url = api + '/v4/aliases/' + urllib.parse.quote(origin.hostname, safe='') + '?' + query
    existing = request(alias_url, token)
    if existing.get('projectId') != deployment.get('projectId'):
        raise RuntimeError('The existing alias belongs to a different project; manual review is required. No alias was changed.')
    print('Firebase-authorized development hostname:', origin.hostname)
    print('Verified Preview commit:', sha)
    if not args.apply:
        print('Dry run only. Use --apply to assign this verified deployment to the fixed alias.')
        return
    request(api + '/v2/deployments/' + urllib.parse.quote(deployment['id'], safe='') + '/aliases?' + query, token, {'alias': origin.hostname})
    assigned = request(alias_url, token)
    deployment_id = assigned.get('deploymentId') or (assigned.get('deployment') or {}).get('id')
    if deployment_id != deployment['id']:
        raise RuntimeError('Alias assignment returned, but its deployment binding could not be confirmed.')
    print('Verified development URL:', domains['developmentOrigin'] + '/studio')

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, KeyError) as error:
        print('BLOCKED:', str(error), file=sys.stderr)
        sys.exit(2)

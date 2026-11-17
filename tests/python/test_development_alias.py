import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / 'scripts' / 'assign-development-domain.py'
spec = importlib.util.spec_from_file_location('development_alias', path)
alias = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alias)
SHA = 'a' * 40
HOST = 'merk-discoveryflow-git-dev-merk3.vercel.app'

class AliasSafetyTests(unittest.TestCase):
    def run_script(self, apply=False, domains=None, target=None, sha=SHA):
        calls = []
        def fake_request(url, token=None, body=None):
            calls.append((url, body))
            if 'identitytoolkit.googleapis.com' in url:
                return {'authorizedDomains': domains if domains is not None else [HOST]}
            if '/v13/deployments/' in url:
                return {'id': 'dpl_fixture', 'projectId': 'prj_fixture', 'name': 'merk-discoveryflow', 'readyState': 'READY', 'target': target, 'meta': {'githubCommitSha': sha}}
            if '/v2/deployments/' in url:
                return {'alias': HOST}
            return {'projectId': 'prj_fixture', 'deploymentId': 'dpl_fixture'}
        args = ['alias', '--deployment-id', 'dpl_fixture', '--expected-sha', SHA] + (['--apply'] if apply else [])
        with patch('builtins.print'), patch.dict(os.environ, {'VERCEL_TOKEN': 'local-fixture-not-a-real-token'}), patch.object(sys, 'argv', args), patch.object(alias, 'request', side_effect=fake_request):
            alias.main()
        return calls

    def test_dry_run_never_changes_alias(self):
        self.assertFalse(any(body is not None for _, body in self.run_script()))

    def test_apply_only_assigns_the_fixed_verified_alias(self):
        writes = [(url, body) for url, body in self.run_script(apply=True) if body is not None]
        self.assertEqual(len(writes), 1)
        self.assertIn('/v2/deployments/dpl_fixture/aliases', writes[0][0])
        self.assertEqual(writes[0][1], {'alias': HOST})

    def test_untrusted_firebase_domain_blocks_assignment(self):
        with self.assertRaisesRegex(RuntimeError, 'not authorized'):
            self.run_script(apply=True, domains=['localhost'])

    def test_production_and_unexpected_commits_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'Preview'):
            self.run_script(apply=True, target='production')
        with self.assertRaisesRegex(RuntimeError, 'expected dev commit'):
            self.run_script(apply=True, sha='b' * 40)

if __name__ == '__main__':
    unittest.main()

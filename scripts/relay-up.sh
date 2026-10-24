#!/bin/sh
# Upload HEAD as a tarball to the temporary deploy_relay table (Composio side pulls it and commits to GitHub).
set -e
OUT=$(mktemp -d)
git archive --format=tar HEAD | gzip -9 > "$OUT/full.tgz"
python3 -c "import base64,json,sys;json.dump({'id':sys.argv[2],'b64':base64.b64encode(open(sys.argv[1],'rb').read()).decode()},open(sys.argv[1]+'.json','w'))" "$OUT/full.tgz" "$1"
sha256sum "$OUT/full.tgz" | cut -c1-64
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://pknqtfkdlpkhzyrysnft.supabase.co/rest/v1/deploy_relay" -H "apikey: sb_publishable_tBfe7UFz0OEgOpePYVtmOQ_IQGpfIIU" -H "Content-Type: application/json" -H "Prefer: return=minimal" --data-binary @"$OUT/full.tgz.json"

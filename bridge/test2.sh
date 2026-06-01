#!/bin/bash
cd /tmp/nanobot-bridge
OC_GATEWAY_TOKEN="${OC_GATEWAY_TOKEN:?Set OC_GATEWAY_TOKEN before running test}" BRIDGE_PORT=8765 node src/bridge.js &
BRIDGE_PID=$!
echo "Bridge PID: $BRIDGE_PID"
sleep 4
echo "=== Testing bootstrap ==="
STATUS=$(curl -s -o /tmp/bootstrap.json -w "%{http_code}" http://127.0.0.1:8765/webui/bootstrap)
echo "HTTP Status: $STATUS"
cat /tmp/bootstrap.json
echo ""
echo "=== Testing sessions ==="
STATUS2=$(curl -s -o /tmp/sessions.json -w "%{http_code}" http://127.0.0.1:8765/api/sessions)
echo "HTTP Status: $STATUS2"
cat /tmp/sessions.json
echo ""
echo "=== Killing bridge ==="
kill $BRIDGE_PID 2>/dev/null
wait $BRIDGE_PID 2>/dev/null
echo "Done"

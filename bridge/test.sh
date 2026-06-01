#!/bin/bash
cd /tmp/nanobot-bridge
OC_GATEWAY_TOKEN="${OC_GATEWAY_TOKEN:?Set OC_GATEWAY_TOKEN before running test}" BRIDGE_PORT=8765 node src/bridge.js &
BRIDGE_PID=$!
echo "Bridge PID: $BRIDGE_PID"
sleep 3
echo "Testing bootstrap..."
curl -s http://127.0.0.1:8765/webui/bootstrap
echo ""
echo "Testing sessions..."
curl -s http://127.0.0.1:8765/api/sessions
echo ""
echo "Killing bridge..."
kill $BRIDGE_PID 2>/dev/null
wait $BRIDGE_PID 2>/dev/null
echo "Done"
